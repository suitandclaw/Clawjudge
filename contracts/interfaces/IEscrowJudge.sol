// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEscrowJudge
 * @dev Interface for EscrowJudge contract
 */
interface IEscrowJudge {
    enum BountyStatus {
        Pending,
        Submitted,
        Judging,
        Reveal,
        Completed,
        Disputed,
        Cancelled
    }

    enum Verdict {
        None,
        Pass,
        Partial,
        Fail
    }

    struct Bounty {
        address poster;
        address worker;
        address token;
        uint256 amount;
        uint256 createdAt;
        uint256 deadline;
        uint256 judgeDeadline;
        BountyStatus status;
        bytes32 requirementsHash;
        bytes32 submissionHash;
        uint256 partialPercentage;
        uint256 feeAmount;
    }

    function createBounty(
        address _token,
        uint256 _amount,
        uint256 _deadline,
        bytes32 _requirementsHash
    ) external payable returns (uint256);

    function submitWork(uint256 _bountyId, bytes32 _submissionHash) external;
    function assignJudges(uint256 _bountyId, address[] calldata _judges) external;
    function processVerdict(uint256 _bountyId) external;
    function recordVerdict(
        uint256 _bountyId,
        address _judge,
        Verdict _verdict,
        uint256 _partialPercentage
    ) external;
    function endCommitPhase(uint256 _bountyId) external;
    function resolveDispute(
        uint256 _bountyId,
        Verdict _verdict,
        uint256 _partialPercentage
    ) external;
    function cancelBounty(uint256 _bountyId) external;

    function bounties(uint256 _bountyId) external view returns (
        address poster,
        address worker,
        address token,
        uint256 amount,
        uint256 createdAt,
        uint256 deadline,
        uint256 judgeDeadline,
        BountyStatus status,
        bytes32 requirementsHash,
        bytes32 submissionHash,
        uint256 partialPercentage,
        uint256 feeAmount
    );

    function getBounty(uint256 _bountyId) external view returns (Bounty memory);
    function getPanelJudges(uint256 _bountyId) external view returns (address[] memory);
    function getJudgeVerdict(uint256 _bountyId, address _judge) external view returns (Verdict);
}
