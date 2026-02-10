// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IJudgeRegistry.sol";
import "./interfaces/ICommitReveal.sol";

/**
 * @title EscrowJudge
 * @dev Core escrow and settlement logic for ClawJudge bounty verification system
 * @notice Manages bounty funds, judge panels, and payment release based on consensus
 */
contract EscrowJudge is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ Enums ============
    
    enum BountyStatus {
        Pending,        // Bounty created, waiting for submission
        Submitted,      // Work submitted, judge selection pending
        Judging,        // Judges assigned, commit phase active
        Reveal,         // Reveal phase active
        Completed,      // Verdict reached, funds released
        Disputed,       // No consensus, arbitration required
        Cancelled       // Bounty cancelled by poster
    }

    enum Verdict {
        None,           // No verdict yet
        Pass,           // Full release to worker
        Partial,        // Partial release (percentage specified)
        Fail            // Return funds to poster
    }

    // ============ Structs ============
    
    struct Bounty {
        address poster;           // Creator of bounty
        address worker;           // Submitter of work
        address token;            // USDC or ETH (address(0) for ETH)
        uint256 amount;           // Total escrow amount
        uint256 createdAt;        // Timestamp of creation
        uint256 deadline;         // Submission deadline
        uint256 judgeDeadline;    // Deadline for judge selection
        BountyStatus status;      // Current status
        bytes32 requirementsHash; // IPFS hash of requirements
        bytes32 submissionHash;   // IPFS hash of submission
        uint256 partialPercentage; // For PARTIAL verdicts (0-100)
        uint256 feeAmount;        // ClawJudge fee (2%)
    }

    struct JudgePanel {
        address[] judges;         // Selected judges
        uint256 commitDeadline;   // Deadline for commit phase
        uint256 revealDeadline;   // Deadline for reveal phase
        bool commitPhaseComplete; // Whether all judges committed
        bool revealPhaseComplete; // Whether all judges revealed
        mapping(address => bool) hasCommitted;
        mapping(address => bool) hasRevealed;
        mapping(address => Verdict) verdicts;
        mapping(address => uint256) partialPercentages;
    }

    struct Dispute {
        uint256 bountyId;
        uint256 createdAt;
        uint256 arbitrationDeadline;
        address arbitrator;
        bool resolved;
        Verdict finalVerdict;
        uint256 finalPartialPercentage;
    }

    // ============ State Variables ============
    
    // Fee configuration
    uint256 public constant FEE_BASIS_POINTS = 200; // 2% = 200 basis points
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;
    address public treasury;

    // Bounty tracking
    uint256 public nextBountyId;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => JudgePanel) public panels;
    mapping(uint256 => Dispute) public disputes;
    
    // Contract references
    IJudgeRegistry public judgeRegistry;
    ICommitReveal public commitReveal;

    // Dispute configuration
    uint256 public constant DISPUTE_WINDOW = 7 days;
    uint256 public constant MIN_JUDGES = 5;
    uint256 public constant SUPERMAJORITY_THRESHOLD = 4; // 4/5 judges
    uint256 public constant EXPANDED_PANEL_SIZE = 9;
    uint256 public constant EXPANDED_SUPERMAJORITY = 6; // 6/9 judges

    // ============ Events ============
    
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed poster,
        uint256 amount,
        address token,
        uint256 deadline
    );
    
    event WorkSubmitted(
        uint256 indexed bountyId,
        address indexed worker,
        bytes32 submissionHash
    );
    
    event JudgesAssigned(
        uint256 indexed bountyId,
        address[] judges,
        uint256 commitDeadline,
        uint256 revealDeadline
    );
    
    event FundsReleased(
        uint256 indexed bountyId,
        Verdict verdict,
        uint256 workerAmount,
        uint256 feeAmount
    );
    
    event DisputeInitiated(
        uint256 indexed bountyId,
        uint256 disputeId,
        uint256 arbitrationDeadline
    );
    
    event DisputeResolved(
        uint256 indexed disputeId,
        Verdict verdict,
        uint256 partialPercentage
    );
    
    event BountyCancelled(uint256 indexed bountyId);

    // ============ Modifiers ============
    
    modifier onlyBountyPoster(uint256 _bountyId) {
        require(msg.sender == bounties[_bountyId].poster, "Not bounty poster");
        _;
    }

    modifier validBounty(uint256 _bountyId) {
        require(_bountyId < nextBountyId, "Invalid bounty ID");
        _;
    }

    // ============ Constructor ============
    
    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    // ============ External Functions ============

    /**
     * @dev Set contract references
     * @param _judgeRegistry Address of JudgeRegistry contract
     * @param _commitReveal Address of CommitReveal contract
     */
    function setContractReferences(
        address _judgeRegistry,
        address _commitReveal
    ) external onlyOwner {
        require(_judgeRegistry != address(0), "Invalid judge registry");
        require(_commitReveal != address(0), "Invalid commit reveal");
        judgeRegistry = IJudgeRegistry(_judgeRegistry);
        commitReveal = ICommitReveal(_commitReveal);
    }

    /**
     * @dev Create a new bounty with escrow
     * @param _token Token address (address(0) for ETH)
     * @param _amount Bounty amount
     * @param _deadline Submission deadline timestamp
     * @param _requirementsHash IPFS hash of bounty requirements
     */
    function createBounty(
        address _token,
        uint256 _amount,
        uint256 _deadline,
        bytes32 _requirementsHash
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(_amount > 0, "Amount must be > 0");
        require(_deadline > block.timestamp, "Deadline must be in future");
        require(_requirementsHash != bytes32(0), "Invalid requirements hash");
        require(address(judgeRegistry) != address(0), "Contracts not set");
        
        // Check minimum judges available
        require(
            judgeRegistry.getActiveJudgeCount() >= MIN_JUDGES,
            "Insufficient judges"
        );

        uint256 bountyId = nextBountyId++;
        uint256 feeAmount = (_amount * FEE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;

        // Handle token transfer
        if (_token == address(0)) {
            // ETH
            require(msg.value == _amount, "Incorrect ETH amount");
        } else {
            // ERC20
            require(msg.value == 0, "ETH not accepted for token bounties");
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }

        bounties[bountyId] = Bounty({
            poster: msg.sender,
            worker: address(0),
            token: _token,
            amount: _amount,
            createdAt: block.timestamp,
            deadline: _deadline,
            judgeDeadline: 0,
            status: BountyStatus.Pending,
            requirementsHash: _requirementsHash,
            submissionHash: bytes32(0),
            partialPercentage: 0,
            feeAmount: feeAmount
        });

        emit BountyCreated(
            bountyId,
            msg.sender,
            _amount,
            _token,
            _deadline
        );

        return bountyId;
    }

    /**
     * @dev Submit work for a bounty
     * @param _bountyId Bounty ID
     * @param _submissionHash IPFS hash of submission
     */
    function submitWork(
        uint256 _bountyId,
        bytes32 _submissionHash
    ) external validBounty(_bountyId) whenNotPaused {
        Bounty storage bounty = bounties[_bountyId];
        
        require(bounty.status == BountyStatus.Pending, "Invalid bounty status");
        require(block.timestamp <= bounty.deadline, "Deadline passed");
        require(_submissionHash != bytes32(0), "Invalid submission hash");
        require(msg.sender != bounty.poster, "Poster cannot submit");

        bounty.worker = msg.sender;
        bounty.submissionHash = _submissionHash;
        bounty.status = BountyStatus.Submitted;

        emit WorkSubmitted(_bountyId, msg.sender, _submissionHash);
    }

    /**
     * @dev Assign judges to a bounty (called by JudgeSelection contract)
     * @param _bountyId Bounty ID
     * @param _judges Array of judge addresses
     */
    function assignJudges(
        uint256 _bountyId,
        address[] calldata _judges
    ) external validBounty(_bountyId) whenNotPaused {
        require(msg.sender == address(judgeRegistry), "Only judge registry");
        require(_judges.length == MIN_JUDGES, "Must assign 5 judges");
        
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.status == BountyStatus.Submitted, "Invalid status");

        JudgePanel storage panel = panels[_bountyId];
        
        // Copy judges to storage
        for (uint i = 0; i < _judges.length; i++) {
            panel.judges.push(_judges[i]);
        }

        // Set deadlines (24 hours each phase)
        panel.commitDeadline = block.timestamp + 1 days;
        panel.revealDeadline = panel.commitDeadline + 1 days;

        bounty.status = BountyStatus.Judging;
        bounty.judgeDeadline = panel.revealDeadline;

        emit JudgesAssigned(
            _bountyId,
            _judges,
            panel.commitDeadline,
            panel.revealDeadline
        );
    }

    /**
     * @dev Process verdicts after reveal phase
     * @param _bountyId Bounty ID
     */
    function processVerdict(
        uint256 _bountyId
    ) external validBounty(_bountyId) nonReentrant whenNotPaused {
        Bounty storage bounty = bounties[_bountyId];
        JudgePanel storage panel = panels[_bountyId];

        require(bounty.status == BountyStatus.Reveal, "Not in reveal phase");
        require(block.timestamp > panel.revealDeadline, "Reveal phase not ended");

        // Count verdicts
        uint256 passCount = 0;
        uint256 failCount = 0;
        uint256 partialCount = 0;
        uint256 totalPartialPercentage = 0;

        for (uint i = 0; i < panel.judges.length; i++) {
            address judge = panel.judges[i];
            if (panel.hasRevealed[judge]) {
                Verdict v = panel.verdicts[judge];
                if (v == Verdict.Pass) passCount++;
                else if (v == Verdict.Fail) failCount++;
                else if (v == Verdict.Partial) {
                    partialCount++;
                    totalPartialPercentage += panel.partialPercentages[judge];
                }
            }
        }

        uint256 revealedCount = passCount + failCount + partialCount;
        require(revealedCount > 0, "No verdicts revealed");

        // Determine consensus
        Verdict finalVerdict = Verdict.None;
        uint256 finalPartialPercentage = 0;

        // Check for supermajority
        if (passCount >= SUPERMAJORITY_THRESHOLD) {
            finalVerdict = Verdict.Pass;
        } else if (failCount >= SUPERMAJORITY_THRESHOLD) {
            finalVerdict = Verdict.Fail;
        } else if (partialCount >= SUPERMAJORITY_THRESHOLD) {
            finalVerdict = Verdict.Partial;
            finalPartialPercentage = totalPartialPercentage / partialCount;
        } else {
            // No supermajority - escalate to dispute
            _initiateDispute(_bountyId);
            return;
        }

        // Execute verdict
        _executeVerdict(_bountyId, finalVerdict, finalPartialPercentage);
    }

    /**
     * @dev Record a judge's verdict (called by CommitReveal contract)
     * @param _bountyId Bounty ID
     * @param _judge Judge address
     * @param _verdict Judge's verdict
     * @param _partialPercentage For partial verdicts (0-100)
     */
    function recordVerdict(
        uint256 _bountyId,
        address _judge,
        Verdict _verdict,
        uint256 _partialPercentage
    ) external validBounty(_bountyId) {
        require(msg.sender == address(commitReveal), "Only commit reveal");
        require(_verdict != Verdict.None, "Invalid verdict");

        JudgePanel storage panel = panels[_bountyId];
        
        // Verify judge is on panel
        bool isPanelJudge = false;
        for (uint i = 0; i < panel.judges.length; i++) {
            if (panel.judges[i] == _judge) {
                isPanelJudge = true;
                break;
            }
        }
        require(isPanelJudge, "Not a panel judge");

        panel.verdicts[_judge] = _verdict;
        panel.partialPercentages[_judge] = _partialPercentage;
        panel.hasRevealed[_judge] = true;

        // Check if all judges revealed
        bool allRevealed = true;
        for (uint i = 0; i < panel.judges.length; i++) {
            if (!panel.hasRevealed[panel.judges[i]]) {
                allRevealed = false;
                break;
            }
        }

        if (allRevealed) {
            panel.revealPhaseComplete = true;
            bounties[_bountyId].status = BountyStatus.Reveal;
        }
    }

    /**
     * @dev Move bounty to reveal phase when commit phase ends
     * @param _bountyId Bounty ID
     */
    function endCommitPhase(
        uint256 _bountyId
    ) external validBounty(_bountyId) whenNotPaused {
        Bounty storage bounty = bounties[_bountyId];
        JudgePanel storage panel = panels[_bountyId];

        require(bounty.status == BountyStatus.Judging, "Not in judging phase");
        require(block.timestamp > panel.commitDeadline, "Commit phase not ended");

        bounty.status = BountyStatus.Reveal;
    }

    /**
     * @dev Resolve a dispute (called by arbitrator)
     * @param _bountyId Bounty ID
     * @param _verdict Final verdict
     * @param _partialPercentage For partial verdicts
     */
    function resolveDispute(
        uint256 _bountyId,
        Verdict _verdict,
        uint256 _partialPercentage
    ) external validBounty(_bountyId) onlyOwner nonReentrant whenNotPaused {
        Bounty storage bounty = bounties[_bountyId];
        Dispute storage dispute = disputes[_bountyId];

        require(bounty.status == BountyStatus.Disputed, "Not disputed");
        require(!dispute.resolved, "Already resolved");
        require(_verdict != Verdict.None, "Invalid verdict");
        require(_partialPercentage <= 100, "Invalid percentage");

        dispute.resolved = true;
        dispute.finalVerdict = _verdict;
        dispute.finalPartialPercentage = _partialPercentage;

        emit DisputeResolved(dispute.disputeId, _verdict, _partialPercentage);

        _executeVerdict(_bountyId, _verdict, _partialPercentage);
    }

    /**
     * @dev Cancel bounty (only by poster before submission)
     * @param _bountyId Bounty ID
     */
    function cancelBounty(
        uint256 _bountyId
    ) external validBounty(_bountyId) onlyBountyPoster(_bountyId) nonReentrant whenNotPaused {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.status == BountyStatus.Pending, "Cannot cancel");

        bounty.status = BountyStatus.Cancelled;

        // Return funds to poster
        _transferFunds(bounty.poster, bounty.token, bounty.amount);

        emit BountyCancelled(_bountyId);
    }

    // ============ Internal Functions ============

    /**
     * @dev Initiate dispute resolution
     */
    function _initiateDispute(uint256 _bountyId) internal {
        Bounty storage bounty = bounties[_bountyId];
        
        bounty.status = BountyStatus.Disputed;

        uint256 disputeId = _bountyId; // Use same ID for simplicity
        
        disputes[_bountyId] = Dispute({
            bountyId: _bountyId,
            createdAt: block.timestamp,
            arbitrationDeadline: block.timestamp + DISPUTE_WINDOW,
            arbitrator: address(0),
            resolved: false,
            finalVerdict: Verdict.None,
            finalPartialPercentage: 0
        });

        emit DisputeInitiated(_bountyId, disputeId, block.timestamp + DISPUTE_WINDOW);
    }

    /**
     * @dev Execute verdict and release funds
     */
    function _executeVerdict(
        uint256 _bountyId,
        Verdict _verdict,
        uint256 _partialPercentage
    ) internal {
        Bounty storage bounty = bounties[_bountyId];
        
        bounty.status = BountyStatus.Completed;
        bounty.partialPercentage = _partialPercentage;

        uint256 workerAmount;

        if (_verdict == Verdict.Pass) {
            // Full release minus fee
            workerAmount = bounty.amount - bounty.feeAmount;
            _transferFunds(bounty.worker, bounty.token, workerAmount);
            _transferFunds(treasury, bounty.token, bounty.feeAmount);
            
        } else if (_verdict == Verdict.Fail) {
            // Return to poster minus gas estimation
            uint256 gasCost = _estimateGasCost();
            uint256 returnAmount = bounty.amount > gasCost ? bounty.amount - gasCost : 0;
            _transferFunds(bounty.poster, bounty.token, returnAmount);
            if (bounty.amount > gasCost) {
                _transferFunds(treasury, bounty.token, gasCost);
            }
            workerAmount = 0;
            
        } else if (_verdict == Verdict.Partial) {
            // Partial release
            require(_partialPercentage > 0 && _partialPercentage < 100, "Invalid partial");
            uint256 partialAmount = (bounty.amount * _partialPercentage) / 100;
            uint256 partialFee = (partialAmount * FEE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
            workerAmount = partialAmount - partialFee;
            uint256 posterReturn = bounty.amount - partialAmount;
            
            _transferFunds(bounty.worker, bounty.token, workerAmount);
            _transferFunds(bounty.poster, bounty.token, posterReturn);
            _transferFunds(treasury, bounty.token, partialFee);
        }

        emit FundsReleased(_bountyId, _verdict, workerAmount, bounty.feeAmount);
    }

    /**
     * @dev Transfer funds (ETH or ERC20)
     */
    function _transferFunds(
        address _to,
        address _token,
        uint256 _amount
    ) internal {
        require(_to != address(0), "Invalid recipient");
        
        if (_token == address(0)) {
            // ETH
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20
            IERC20(_token).safeTransfer(_to, _amount);
        }
    }

    /**
     * @dev Estimate gas cost for failed bounty return
     */
    function _estimateGasCost() internal pure returns (uint256) {
        // Conservative estimate: 100k gas at 50 gwei
        return 100000 * 50 gwei;
    }

    // ============ View Functions ============

    function getBounty(uint256 _bountyId) external view returns (Bounty memory) {
        return bounties[_bountyId];
    }

    function getPanelJudges(uint256 _bountyId) external view returns (address[] memory) {
        return panels[_bountyId].judges;
    }

    function getJudgeVerdict(
        uint256 _bountyId,
        address _judge
    ) external view returns (Verdict) {
        return panels[_bountyId].verdicts[_judge];
    }

    // ============ Admin Functions ============

    function updateTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury");
        treasury = _newTreasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Receive ============
    
    receive() external payable {
        revert("Use createBounty");
    }
}
