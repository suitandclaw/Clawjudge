// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IEscrowJudge.sol";

/**
 * @title CommitReveal
 * @dev Prevents judges from copying each other's verdicts
 * @notice Two-phase voting: commit hash, then reveal verdict
 */
contract CommitReveal is Ownable, Pausable {
    
    // ============ Structs ============
    
    struct Commit {
        bytes32 commitHash;
        uint256 timestamp;
        bool exists;
    }

    struct Reveal {
        IEscrowJudge.Verdict verdict;
        uint256 partialPercentage;
        bytes32 salt;
        bool exists;
    }

    struct BountyCommits {
        mapping(address => Commit) commits;
        mapping(address => Reveal) reveals;
        uint256 commitCount;
        uint256 revealCount;
        bool commitPhaseActive;
        bool revealPhaseActive;
    }

    // ============ State Variables ============
    
    IEscrowJudge public escrowJudge;
    
    mapping(uint256 => BountyCommits) public bountyCommits;
    
    // Penalty for not revealing after committing
    uint256 public constant NO_REVEAL_PENALTY = 5; // 5% of stake

    // ============ Events ============
    
    event CommitSubmitted(
        uint256 indexed bountyId,
        address indexed judge,
        bytes32 commitHash
    );
    
    event VerdictRevealed(
        uint256 indexed bountyId,
        address indexed judge,
        IEscrowJudge.Verdict verdict,
        uint256 partialPercentage
    );
    
    event PhaseAdvanced(
        uint256 indexed bountyId,
        string phase
    );

    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {}

    // ============ External Functions ============

    /**
     * @dev Set EscrowJudge reference
     */
    function setEscrowJudge(address _escrowJudge) external onlyOwner {
        require(_escrowJudge != address(0), "Invalid address");
        escrowJudge = IEscrowJudge(_escrowJudge);
    }

    /**
     * @dev Submit commit hash for verdict
     * @param _bountyId Bounty ID
     * @param _commitHash keccak256(verdict + salt)
     */
    function submitCommit(
        uint256 _bountyId,
        bytes32 _commitHash
    ) external whenNotPaused {
        require(address(escrowJudge) != address(0), "EscrowJudge not set");
        require(_commitHash != bytes32(0), "Invalid commit");

        BountyCommits storage bc = bountyCommits[_bountyId];
        
        // Verify bounty is in judging phase
        (
            ,
            ,
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

        require(status == IEscrowJudge.BountyStatus.Judging, "Not in judging phase");

        // Verify sender is a judge on this panel
        require(_isPanelJudge(_bountyId, msg.sender), "Not a panel judge");

        // Verify not already committed
        require(!bc.commits[msg.sender].exists, "Already committed");

        // Store commit
        bc.commits[msg.sender] = Commit({
            commitHash: _commitHash,
            timestamp: block.timestamp,
            exists: true
        });

        bc.commitCount++;

        emit CommitSubmitted(_bountyId, msg.sender, _commitHash);

        // Check if all judges have committed
        _checkAllCommitted(_bountyId);
    }

    /**
     * @dev Reveal verdict
     * @param _bountyId Bounty ID
     * @param _verdict Judge's verdict
     * @param _partialPercentage For PARTIAL verdict (0-100)
     * @param _salt Salt used in commit
     */
    function revealVerdict(
        uint256 _bountyId,
        IEscrowJudge.Verdict _verdict,
        uint256 _partialPercentage,
        bytes32 _salt
    ) external whenNotPaused {
        require(_verdict != IEscrowJudge.Verdict.None, "Invalid verdict");
        require(_partialPercentage <= 100, "Invalid percentage");

        BountyCommits storage bc = bountyCommits[_bountyId];

        // Verify bounty is in reveal phase
        (
            ,
            ,
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

        require(status == IEscrowJudge.BountyStatus.Reveal, "Not in reveal phase");

        // Verify sender is a judge on this panel
        require(_isPanelJudge(_bountyId, msg.sender), "Not a panel judge");

        // Verify has committed
        require(bc.commits[msg.sender].exists, "No commit found");

        // Verify not already revealed
        require(!bc.reveals[msg.sender].exists, "Already revealed");

        // Verify commit matches reveal
        bytes32 commitHash = keccak256(abi.encodePacked(_verdict, _partialPercentage, _salt));
        require(
            commitHash == bc.commits[msg.sender].commitHash,
            "Commit mismatch"
        );

        // Store reveal
        bc.reveals[msg.sender] = Reveal({
            verdict: _verdict,
            partialPercentage: _partialPercentage,
            salt: _salt,
            exists: true
        });

        bc.revealCount++;

        emit VerdictRevealed(_bountyId, msg.sender, _verdict, _partialPercentage);

        // Record verdict with EscrowJudge
        escrowJudge.recordVerdict(_bountyId, msg.sender, _verdict, _partialPercentage);

        // Check if all judges have revealed
        _checkAllRevealed(_bountyId);
    }

    /**
     * @dev Penalize judge who committed but didn't reveal
     * @param _bountyId Bounty ID
     * @param _judge Judge address
     */
    function penalizeNoReveal(
        uint256 _bountyId,
        address _judge
    ) external onlyOwner {
        BountyCommits storage bc = bountyCommits[_bountyId];

        require(bc.commits[_judge].exists, "No commit found");
        require(!bc.reveals[_judge].exists, "Already revealed");

        // Verify reveal phase has ended
        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 revealDeadline,
            IEscrowJudge.BountyStatus status,
            ,
            ,
            ,

        ) = escrowJudge.bounties(_bountyId);

        require(
            status == IEscrowJudge.BountyStatus.Reveal,
            "Not in reveal phase"
        );
        require(block.timestamp > revealDeadline, "Reveal phase not ended");

        // Mark as "revealed" with FAIL to prevent double penalty
        bc.reveals[_judge] = Reveal({
            verdict: IEscrowJudge.Verdict.Fail,
            partialPercentage: 0,
            salt: bytes32(0),
            exists: true
        });

        bc.revealCount++;

        // Record with EscrowJudge
        escrowJudge.recordVerdict(
            _bountyId,
            _judge,
            IEscrowJudge.Verdict.Fail,
            0
        );

        // Penalty applied via JudgeRegistry
        emit VerdictRevealed(_bountyId, _judge, IEscrowJudge.Verdict.Fail, 0);
    }

    // ============ Internal Functions ============

    /**
     * @dev Check if all judges have committed
     */
    function _checkAllCommitted(uint256 _bountyId) internal {
        BountyCommits storage bc = bountyCommits[_bountyId];
        
        address[] memory judges = escrowJudge.getPanelJudges(_bountyId);
        
        if (bc.commitCount >= judges.length) {
            bc.commitPhaseActive = false;
            bc.revealPhaseActive = true;
            emit PhaseAdvanced(_bountyId, "REVEAL");
            
            // Advance bounty status
            escrowJudge.endCommitPhase(_bountyId);
        }
    }

    /**
     * @dev Check if all judges have revealed
     */
    function _checkAllRevealed(uint256 _bountyId) internal {
        BountyCommits storage bc = bountyCommits[_bountyId];
        
        address[] memory judges = escrowJudge.getPanelJudges(_bountyId);
        
        if (bc.revealCount >= judges.length) {
            bc.revealPhaseActive = false;
            emit PhaseAdvanced(_bountyId, "COMPLETE");
        }
    }

    /**
     * @dev Check if address is a panel judge
     */
    function _isPanelJudge(
        uint256 _bountyId,
        address _addr
    ) internal view returns (bool) {
        address[] memory judges = escrowJudge.getPanelJudges(_bountyId);
        for (uint i = 0; i < judges.length; i++) {
            if (judges[i] == _addr) {
                return true;
            }
        }
        return false;
    }

    // ============ View Functions ============

    function getCommit(
        uint256 _bountyId,
        address _judge
    ) external view returns (bytes32 commitHash, uint256 timestamp, bool exists) {
        Commit memory c = bountyCommits[_bountyId].commits[_judge];
        return (c.commitHash, c.timestamp, c.exists);
    }

    function getReveal(
        uint256 _bountyId,
        address _judge
    ) external view returns (
        IEscrowJudge.Verdict verdict,
        uint256 partialPercentage,
        bool exists
    ) {
        Reveal memory r = bountyCommits[_bountyId].reveals[_judge];
        return (r.verdict, r.partialPercentage, r.exists);
    }

    function hasCommitted(
        uint256 _bountyId,
        address _judge
    ) external view returns (bool) {
        return bountyCommits[_bountyId].commits[_judge].exists;
    }

    function hasRevealed(
        uint256 _bountyId,
        address _judge
    ) external view returns (bool) {
        return bountyCommits[_bountyId].reveals[_judge].exists;
    }

    function getCommitCount(uint256 _bountyId) external view returns (uint256) {
        return bountyCommits[_bountyId].commitCount;
    }

    function getRevealCount(uint256 _bountyId) external view returns (uint256) {
        return bountyCommits[_bountyId].revealCount;
    }

    // ============ Admin Functions ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
