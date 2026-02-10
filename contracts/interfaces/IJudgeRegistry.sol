// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IJudgeRegistry
 * @dev Interface for JudgeRegistry contract
 */
interface IJudgeRegistry {
    struct Judge {
        address judgeAddress;
        uint256 stakedAmount;
        uint256 reputation;
        uint256 lastActivity;
        uint256 totalVerdicts;
        uint256 correctVerdicts;
        uint256 consecutiveMinority;
        bool isActive;
        bool isRegistered;
    }

    function register() external;
    function increaseStake(uint256 _amount) external;
    function withdrawStake(uint256 _amount) external;
    function recordVerdictResult(address _judge, bool _agreedWithConsensus) external;
    function applyDecay(address _judge) external;
    function reactivate() external;
    function deactivateJudge(address _judge) external;
    
    function getJudge(address _judge) external view returns (Judge memory);
    function getReputation(address _judge) external view returns (uint256);
    function isActiveJudge(address _judge) external view returns (bool);
    function getActiveJudgeCount() external view returns (uint256);
    function getAllActiveJudges() external view returns (address[] memory);
    function getEligibleJudges() external view returns (address[] memory);
    function canServeOnPanel(address _judge) external view returns (bool);
}
