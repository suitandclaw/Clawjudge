// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title JudgeRegistry
 * @dev Manages judge registration, reputation, and staking
 * @notice Judges must stake 50 USDC minimum and maintain reputation above threshold
 */
contract JudgeRegistry is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    uint256 public constant MINIMUM_STAKE = 50 * 10**6; // 50 USDC (6 decimals)
    uint256 public constant INITIAL_REPUTATION = 500; // 0-1000 scale
    uint256 public constant MAX_REPUTATION = 1000;
    uint256 public constant MIN_REPUTATION = 0;
    uint256 public constant REPUTATION_DECAY_RATE = 5; // -5 per month of inactivity
    uint256 public constant SLASH_PERCENTAGE = 10; // 10% of stake
    uint256 public constant CONSECUTIVE_MINORITY_THRESHOLD = 3;
    uint256 public constant REPUTATION_THRESHOLD_LOW = 300;
    uint256 public constant REPUTATION_THRESHOLD_HIGH = 800;
    uint256 public constant INACTIVITY_PERIOD = 30 days;
    uint256 public constant MINIMUM_ACTIVE_JUDGES = 20;

    // ============ Structs ============
    
    struct Judge {
        address judgeAddress;
        uint256 stakedAmount;
        uint256 reputation; // 0-1000
        uint256 lastActivity;
        uint256 totalVerdicts;
        uint256 correctVerdicts; // Agreed with consensus
        uint256 consecutiveMinority; // Consecutive times disagreed with consensus
        bool isActive;
        bool isRegistered;
    }

    // ============ State Variables ============
    
    IERC20 public usdc;
    mapping(address => Judge) public judges;
    address[] public judgeList;
    mapping(address => bool) public isJudge;
    
    uint256 public totalActiveJudges;
    address public escrowJudge;

    // ============ Events ============
    
    event JudgeRegistered(
        address indexed judge,
        uint256 stakeAmount,
        uint256 initialReputation
    );
    
    event StakeIncreased(address indexed judge, uint256 newStake);
    event StakeWithdrawn(address indexed judge, uint256 amount);
    
    event ReputationUpdated(
        address indexed judge,
        uint256 oldReputation,
        uint256 newReputation,
        string reason
    );
    
    event JudgeSlashed(
        address indexed judge,
        uint256 slashAmount,
        uint256 newReputation
    );
    
    event JudgeActivated(address indexed judge);
    event JudgeDeactivated(address indexed judge);

    // ============ Modifiers ============
    
    modifier onlyRegisteredJudge(address _judge) {
        require(judges[_judge].isRegistered, "Not registered");
        _;
    }

    modifier onlyEscrowJudge() {
        require(msg.sender == escrowJudge, "Only EscrowJudge");
        _;
    }

    // ============ Constructor ============
    
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    // ============ External Functions ============

    /**
     * @dev Register as a judge with minimum stake
     */
    function register() external nonReentrant whenNotPaused {
        require(!judges[msg.sender].isRegistered, "Already registered");
        
        // Transfer stake
        usdc.safeTransferFrom(msg.sender, address(this), MINIMUM_STAKE);

        // Create judge record
        judges[msg.sender] = Judge({
            judgeAddress: msg.sender,
            stakedAmount: MINIMUM_STAKE,
            reputation: INITIAL_REPUTATION,
            lastActivity: block.timestamp,
            totalVerdicts: 0,
            correctVerdicts: 0,
            consecutiveMinority: 0,
            isActive: true,
            isRegistered: true
        });

        judgeList.push(msg.sender);
        isJudge[msg.sender] = true;
        totalActiveJudges++;

        emit JudgeRegistered(msg.sender, MINIMUM_STAKE, INITIAL_REPUTATION);
        emit JudgeActivated(msg.sender);
    }

    /**
     * @dev Add more stake to increase reputation weight
     * @param _amount Additional USDC to stake
     */
    function increaseStake(uint256 _amount) external onlyRegisteredJudge(msg.sender) nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be > 0");
        
        usdc.safeTransferFrom(msg.sender, address(this), _amount);
        
        Judge storage judge = judges[msg.sender];
        judge.stakedAmount += _amount;

        emit StakeIncreased(msg.sender, judge.stakedAmount);
    }

    /**
     * @dev Withdraw stake (deactivates judge)
     * @param _amount Amount to withdraw
     */
    function withdrawStake(uint256 _amount) external onlyRegisteredJudge(msg.sender) nonReentrant {
        Judge storage judge = judges[msg.sender];
        
        require(_amount <= judge.stakedAmount, "Insufficient stake");
        require(_amount > 0, "Amount must be > 0");
        
        // Cannot withdraw below minimum if still active
        if (judge.isActive) {
            require(
                judge.stakedAmount - _amount >= MINIMUM_STAKE,
                "Cannot go below minimum stake"
            );
        }

        judge.stakedAmount -= _amount;
        usdc.safeTransfer(msg.sender, _amount);

        // Deactivate if below minimum
        if (judge.stakedAmount < MINIMUM_STAKE && judge.isActive) {
            _deactivateJudge(msg.sender);
        }

        emit StakeWithdrawn(msg.sender, _amount);
    }

    /**
     * @dev Record verdict result and update reputation (called by EscrowJudge)
     * @param _judge Judge address
     * @param _agreedWithConsensus Whether judge agreed with final consensus
     */
    function recordVerdictResult(
        address _judge,
        bool _agreedWithConsensus
    ) external onlyEscrowJudge onlyRegisteredJudge(_judge) whenNotPaused {
        Judge storage judge = judges[_judge];
        
        uint256 oldReputation = judge.reputation;
        judge.totalVerdicts++;
        judge.lastActivity = block.timestamp;

        if (_agreedWithConsensus) {
            // Correct verdict
            judge.correctVerdicts++;
            judge.consecutiveMinority = 0;
            
            // Increase reputation slightly (+10, max 1000)
            if (judge.reputation < MAX_REPUTATION) {
                judge.reputation = _min(judge.reputation + 10, MAX_REPUTATION);
                emit ReputationUpdated(
                    _judge,
                    oldReputation,
                    judge.reputation,
                    "Correct verdict"
                );
            }
        } else {
            // Disagreed with consensus
            judge.consecutiveMinority++;
            
            // Decrease reputation (-20, min 0)
            if (judge.reputation > MIN_REPUTATION) {
                judge.reputation = _max(judge.reputation - 20, MIN_REPUTATION);
                emit ReputationUpdated(
                    _judge,
                    oldReputation,
                    judge.reputation,
                    "Disagreed with consensus"
                );
            }

            // Check for slashing
            if (judge.consecutiveMinority >= CONSECUTIVE_MINORITY_THRESHOLD) {
                _slashJudge(_judge);
            }
        }

        // Check if reputation dropped below threshold
        if (judge.reputation < REPUTATION_THRESHOLD_LOW && judge.isActive) {
            _deactivateJudge(_judge);
        }
    }

    /**
     * @dev Apply reputation decay for inactive judges
     * @param _judge Judge address to check
     */
    function applyDecay(address _judge) external onlyRegisteredJudge(_judge) whenNotPaused {
        Judge storage judge = judges[_judge];
        
        uint256 timeSinceActivity = block.timestamp - judge.lastActivity;
        uint256 monthsInactive = timeSinceActivity / INACTIVITY_PERIOD;
        
        if (monthsInactive > 0) {
            uint256 oldReputation = judge.reputation;
            uint256 decayAmount = monthsInactive * REPUTATION_DECAY_RATE;
            
            judge.reputation = _max(judge.reputation - decayAmount, MIN_REPUTATION);
            judge.lastActivity = block.timestamp; // Reset to prevent double decay

            emit ReputationUpdated(
                _judge,
                oldReputation,
                judge.reputation,
                "Inactivity decay"
            );

            if (judge.reputation < REPUTATION_THRESHOLD_LOW && judge.isActive) {
                _deactivateJudge(_judge);
            }
        }
    }

    /**
     * @dev Reactivate a deactivated judge (if stake and reputation sufficient)
     */
    function reactivate() external onlyRegisteredJudge(msg.sender) whenNotPaused {
        Judge storage judge = judges[msg.sender];
        
        require(!judge.isActive, "Already active");
        require(judge.stakedAmount >= MINIMUM_STAKE, "Insufficient stake");
        require(judge.reputation >= REPUTATION_THRESHOLD_LOW, "Reputation too low");
        
        judge.isActive = true;
        totalActiveJudges++;

        emit JudgeActivated(msg.sender);
    }

    /**
     * @dev Manually deactivate a judge (can be called by owner for moderation)
     */
    function deactivateJudge(address _judge) external onlyOwner onlyRegisteredJudge(_judge) {
        _deactivateJudge(_judge);
    }

    // ============ Internal Functions ============

    /**
     * @dev Slash a judge for consecutive minority verdicts
     */
    function _slashJudge(address _judge) internal {
        Judge storage judge = judges[_judge];
        
        uint256 slashAmount = (judge.stakedAmount * SLASH_PERCENTAGE) / 100;
        judge.stakedAmount -= slashAmount;
        
        // Send slashed funds to treasury (owner)
        usdc.safeTransfer(owner(), slashAmount);

        // Reset consecutive counter
        judge.consecutiveMinority = 0;

        // Significant reputation hit
        uint256 oldReputation = judge.reputation;
        judge.reputation = _max(judge.reputation - 100, MIN_REPUTATION);

        emit JudgeSlashed(_judge, slashAmount, judge.reputation);
        emit ReputationUpdated(
            _judge,
            oldReputation,
            judge.reputation,
            "Slashed for consecutive minority"
        );

        // Deactivate if below minimum stake
        if (judge.stakedAmount < MINIMUM_STAKE) {
            _deactivateJudge(_judge);
        }
    }

    /**
     * @dev Deactivate a judge
     */
    function _deactivateJudge(address _judge) internal {
        Judge storage judge = judges[_judge];
        
        if (judge.isActive) {
            judge.isActive = false;
            totalActiveJudges--;
            emit JudgeDeactivated(_judge);
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    // ============ View Functions ============

    function getJudge(address _judge) external view returns (Judge memory) {
        return judges[_judge];
    }

    function getReputation(address _judge) external view returns (uint256) {
        return judges[_judge].reputation;
    }

    function isActiveJudge(address _judge) external view returns (bool) {
        return judges[_judge].isActive;
    }

    function getActiveJudgeCount() external view returns (uint256) {
        return totalActiveJudges;
    }

    function getAllActiveJudges() external view returns (address[] memory) {
        address[] memory active = new address[](totalActiveJudges);
        uint256 index = 0;
        
        for (uint i = 0; i < judgeList.length; i++) {
            if (judges[judgeList[i]].isActive) {
                active[index] = judgeList[i];
                index++;
            }
        }
        
        return active;
    }

    function getEligibleJudges() external view returns (address[] memory) {
        // Returns judges with sufficient reputation for selection
        uint256 count = 0;
        for (uint i = 0; i < judgeList.length; i++) {
            if (
                judges[judgeList[i]].isActive &&
                judges[judgeList[i]].reputation >= REPUTATION_THRESHOLD_LOW
            ) {
                count++;
            }
        }

        address[] memory eligible = new address[](count);
        uint256 index = 0;
        for (uint i = 0; i < judgeList.length; i++) {
            if (
                judges[judgeList[i]].isActive &&
                judges[judgeList[i]].reputation >= REPUTATION_THRESHOLD_LOW
            ) {
                eligible[index] = judgeList[i];
                index++;
            }
        }

        return eligible;
    }

    function canServeOnPanel(address _judge) external view returns (bool) {
        Judge memory j = judges[_judge];
        return j.isActive && j.reputation >= REPUTATION_THRESHOLD_LOW;
    }

    // ============ Admin Functions ============

    function setEscrowJudge(address _escrowJudge) external onlyOwner {
        require(_escrowJudge != address(0), "Invalid address");
        escrowJudge = _escrowJudge;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency withdrawal (only if contract is paused)
     */
    function emergencyWithdraw(address _to) external onlyOwner whenPaused {
        require(_to != address(0), "Invalid address");
        uint256 balance = usdc.balanceOf(address(this));
        usdc.safeTransfer(_to, balance);
    }
}
