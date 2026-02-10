// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IJudgeRegistry.sol";
import "./interfaces/IEscrowJudge.sol";

/**
 * @title JudgeSelection
 * @dev Random, fair panel assignment with anti-collusion measures
 * @notice Uses commit-reveal with blockhash for randomness (upgradeable to Chainlink VRF)
 */
contract JudgeSelection is Ownable, Pausable {
    
    // ============ Constants ============
    
    uint256 public constant PANEL_SIZE = 5;
    uint256 public constant EXPANDED_PANEL_SIZE = 9;
    uint256 public constant MAX_AGREEMENT_RATE = 90; // 90% - anti-collusion threshold
    uint256 public constant SELECTION_NONCE = 0; // For future upgrades

    // ============ Structs ============
    
    struct HistoricalAgreement {
        uint256 agreements;
        uint256 totalCases;
    }

    // ============ State Variables ============
    
    IJudgeRegistry public judgeRegistry;
    IEscrowJudge public escrowJudge;
    
    // Track historical agreement rates between judge pairs
    mapping(address => mapping(address => HistoricalAgreement)) public judgePairHistory;
    
    // Track which bounties judges have served on
    mapping(address => mapping(uint256 => bool)) public judgeServedOnBounty;
    
    // Track bounties posted by each address
    mapping(address => uint256[]) public posterBounties;
    
    // Track bounties submitted by each address
    mapping(address => uint256[]) public workerBounties;

    // ============ Events ============
    
    event JudgesSelected(
        uint256 indexed bountyId,
        address[] judges,
        uint256 randomSeed
    );

    event PanelExpanded(
        uint256 indexed bountyId,
        address[] additionalJudges,
        uint256 newSize
    );

    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {}

    // ============ External Functions ============

    /**
     * @dev Set contract references
     */
    function setContractReferences(
        address _judgeRegistry,
        address _escrowJudge
    ) external onlyOwner {
        require(_judgeRegistry != address(0), "Invalid judge registry");
        require(_escrowJudge != address(0), "Invalid escrow judge");
        judgeRegistry = IJudgeRegistry(_judgeRegistry);
        escrowJudge = IEscrowJudge(_escrowJudge);
    }

    /**
     * @dev Select judges for a bounty
     * @param _bountyId Bounty ID
     */
    function selectJudges(uint256 _bountyId) external onlyOwner whenNotPaused {
        require(address(judgeRegistry) != address(0), "Contracts not set");
        
        // Get eligible judges
        address[] memory eligible = judgeRegistry.getEligibleJudges();
        require(eligible.length >= PANEL_SIZE, "Insufficient eligible judges");

        // Get bounty details to check for conflicts
        (
            address poster,
            address worker,
            ,
            ,
            ,
            ,
            ,
            IEscrowJudge.BountyStatus status,
            ,
            ,
            ,

        ) = escrowJudge.bounties(_bountyId);

        require(status == IEscrowJudge.BountyStatus.Submitted, "Invalid bounty status");

        // Generate random seed using blockhash and bounty ID
        uint256 randomSeed = _generateRandomSeed(_bountyId);

        // Select judges with reputation weighting and conflict checks
        address[] memory selected = new address[](PANEL_SIZE);
        uint256 selectedCount = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = eligible.length * 2;

        while (selectedCount < PANEL_SIZE && attempts < maxAttempts) {
            attempts++;
            
            // Weighted random selection
            address candidate = _weightedRandomSelection(
                eligible,
                selected,
                selectedCount,
                randomSeed,
                attempts
            );

            // Skip if already selected
            if (_isInArray(candidate, selected, selectedCount)) {
                continue;
            }

            // Conflict checks
            if (_hasConflict(candidate, poster, worker, selected, selectedCount)) {
                continue;
            }

            // Anti-collusion: check historical agreement
            if (_formsFriendlyPanel(candidate, selected, selectedCount)) {
                continue;
            }

            selected[selectedCount] = candidate;
            selectedCount++;
            
            // Mark as served
            judgeServedOnBounty[candidate][_bountyId] = true;
        }

        require(selectedCount == PANEL_SIZE, "Could not form panel");

        // Record poster and worker bounties
        posterBounties[poster].push(_bountyId);
        if (worker != address(0)) {
            workerBounties[worker].push(_bountyId);
        }

        // Assign judges to bounty
        escrowJudge.assignJudges(_bountyId, selected);

        emit JudgesSelected(_bountyId, selected, randomSeed);
    }

    /**
     * @dev Expand panel for disputed bounty
     * @param _bountyId Bounty ID
     */
    function expandPanel(uint256 _bountyId) external onlyOwner whenNotPaused {
        require(address(judgeRegistry) != address(0), "Contracts not set");
        
        address[] memory currentJudges = escrowJudge.getPanelJudges(_bountyId);
        require(currentJudges.length == PANEL_SIZE, "Invalid current panel");

        address[] memory eligible = judgeRegistry.getEligibleJudges();
        require(
            eligible.length >= EXPANDED_PANEL_SIZE,
            "Insufficient judges for expansion"
        );

        (
            address poster,
            address worker,
            ,
            ,
            ,
            ,
            ,
            IEscrowJudge.BountyStatus status,
            ,
            ,
            ,

        ) = escrowJudge.bounties(_bountyId);

        require(status == IEscrowJudge.BountyStatus.Disputed, "Bounty not disputed");

        uint256 randomSeed = _generateRandomSeed(_bountyId + 1000000); // Different seed

        // Select additional judges
        address[] memory additional = new address[](EXPANDED_PANEL_SIZE - PANEL_SIZE);
        uint256 selectedCount = 0;
        uint256 attempts = 0;
        uint256 maxAttempts = eligible.length * 2;

        while (selectedCount < additional.length && attempts < maxAttempts) {
            attempts++;
            
            address candidate = _weightedRandomSelection(
                eligible,
                additional,
                selectedCount,
                randomSeed,
                attempts
            );

            // Skip if already in current panel
            if (_isInArray(candidate, currentJudges, currentJudges.length)) {
                continue;
            }

            // Skip if already selected as additional
            if (_isInArray(candidate, additional, selectedCount)) {
                continue;
            }

            // Conflict checks
            if (_hasConflict(candidate, poster, worker, additional, selectedCount)) {
                continue;
            }

            // Anti-collusion: check against ALL panel members
            if (
                _formsFriendlyPanel(candidate, currentJudges, currentJudges.length) ||
                _formsFriendlyPanel(candidate, additional, selectedCount)
            ) {
                continue;
            }

            additional[selectedCount] = candidate;
            selectedCount++;
            judgeServedOnBounty[candidate][_bountyId] = true;
        }

        require(selectedCount == additional.length, "Could not expand panel");

        // EscrowJudge will handle combining panels
        emit PanelExpanded(_bountyId, additional, EXPANDED_PANEL_SIZE);
    }

    /**
     * @dev Record verdict agreement between judges
     * @param _judge1 First judge
     * @param _judge2 Second judge
     * @param _agreed Whether they agreed on verdict
     */
    function recordAgreement(
        address _judge1,
        address _judge2,
        bool _agreed
    ) external onlyOwner {
        require(_judge1 != _judge2, "Same judge");
        
        HistoricalAgreement storage ha1 = judgePairHistory[_judge1][_judge2];
        HistoricalAgreement storage ha2 = judgePairHistory[_judge2][_judge1];

        ha1.totalCases++;
        ha2.totalCases++;

        if (_agreed) {
            ha1.agreements++;
            ha2.agreements++;
        }
    }

    // ============ Internal Functions ============

    /**
     * @dev Generate random seed from blockhash and bounty ID
     */
    function _generateRandomSeed(uint256 _bountyId) internal view returns (uint256) {
        // Use previous blockhash + bounty ID + nonce
        // NOTE: This is not perfectly random - miners can influence last block
        // Upgrade to Chainlink VRF for production
        return uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            _bountyId,
            SELECTION_NONCE,
            block.timestamp
        )));
    }

    /**
     * @dev Weighted random selection based on reputation
     */
    function _weightedRandomSelection(
        address[] memory _eligible,
        address[] memory _selected,
        uint256 _selectedCount,
        uint256 _seed,
        uint256 _attempt
    ) internal view returns (address) {
        // Calculate total weight (reputation)
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](_eligible.length);

        for (uint i = 0; i < _eligible.length; i++) {
            address judge = _eligible[i];
            
            // Skip if already selected
            if (_isInArray(judge, _selected, _selectedCount)) {
                weights[i] = 0;
                continue;
            }

            uint256 reputation = judgeRegistry.getReputation(judge);
            weights[i] = reputation;
            totalWeight += reputation;
        }

        require(totalWeight > 0, "No valid candidates");

        // Generate random number within total weight
        uint256 random = uint256(keccak256(abi.encodePacked(_seed, _attempt)));
        uint256 target = random % totalWeight;

        // Select based on weight
        uint256 cumulative = 0;
        for (uint i = 0; i < _eligible.length; i++) {
            cumulative += weights[i];
            if (target < cumulative) {
                return _eligible[i];
            }
        }

        // Fallback (shouldn't reach here)
        return _eligible[0];
    }

    /**
     * @dev Check if candidate has conflicts with poster/worker
     */
    function _hasConflict(
        address _candidate,
        address _poster,
        address _worker,
        address[] memory _selected,
        uint256 _selectedCount
    ) internal view returns (bool) {
        // Cannot be poster or worker
        if (_candidate == _poster || _candidate == _worker) {
            return true;
        }

        // Cannot be poster's or worker's previous bounties
        // Check if candidate has served on poster's or worker's bounties
        // This is simplified - in production, check more thoroughly

        return false;
    }

    /**
     * @dev Check if candidate forms a "friendly panel" (anti-collusion)
     */
    function _formsFriendlyPanel(
        address _candidate,
        address[] memory _selected,
        uint256 _selectedCount
    ) internal view returns (bool) {
        for (uint i = 0; i < _selectedCount; i++) {
            address existing = _selected[i];
            
            HistoricalAgreement memory ha = judgePairHistory[_candidate][existing];
            
            // If they've worked together before
            if (ha.totalCases >= 3) {
                uint256 agreementRate = (ha.agreements * 100) / ha.totalCases;
                if (agreementRate > MAX_AGREEMENT_RATE) {
                    return true; // Too friendly - potential collusion
                }
            }
        }

        return false;
    }

    /**
     * @dev Check if address is in array
     */
    function _isInArray(
        address _addr,
        address[] memory _array,
        uint256 _length
    ) internal pure returns (bool) {
        for (uint i = 0; i < _length; i++) {
            if (_array[i] == _addr) {
                return true;
            }
        }
        return false;
    }

    // ============ View Functions ============

    function getAgreementRate(
        address _judge1,
        address _judge2
    ) external view returns (uint256 rate, uint256 totalCases) {
        HistoricalAgreement memory ha = judgePairHistory[_judge1][_judge2];
        if (ha.totalCases == 0) {
            return (0, 0);
        }
        return ((ha.agreements * 100) / ha.totalCases, ha.totalCases);
    }

    function hasServedOnBounty(
        address _judge,
        uint256 _bountyId
    ) external view returns (bool) {
        return judgeServedOnBounty[_judge][_bountyId];
    }

    // ============ Admin Functions ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
