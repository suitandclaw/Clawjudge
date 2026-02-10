// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IEscrowJudge.sol";

/**
 * @title ICommitReveal
 * @dev Interface for CommitReveal contract
 */
interface ICommitReveal {
    function setEscrowJudge(address _escrowJudge) external;
    
    function submitCommit(uint256 _bountyId, bytes32 _commitHash) external;
    
    function revealVerdict(
        uint256 _bountyId,
        IEscrowJudge.Verdict _verdict,
        uint256 _partialPercentage,
        bytes32 _salt
    ) external;
    
    function penalizeNoReveal(uint256 _bountyId, address _judge) external;
    
    function getCommit(
        uint256 _bountyId,
        address _judge
    ) external view returns (bytes32 commitHash, uint256 timestamp, bool exists);
    
    function getReveal(
        uint256 _bountyId,
        address _judge
    ) external view returns (
        IEscrowJudge.Verdict verdict,
        uint256 partialPercentage,
        bool exists
    );
    
    function hasCommitted(uint256 _bountyId, address _judge) external view returns (bool);
    function hasRevealed(uint256 _bountyId, address _judge) external view returns (bool);
    function getCommitCount(uint256 _bountyId) external view returns (uint256);
    function getRevealCount(uint256 _bountyId) external view returns (uint256);
}
