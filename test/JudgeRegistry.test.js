const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('JudgeRegistry', function () {
  let JudgeRegistry;
  let judgeRegistry;
  let owner, judge1, judge2, judge3, treasury;
  let usdc;

  const USDC_DECIMALS = 6;
  const MINIMUM_STAKE = ethers.parseUnits('50', USDC_DECIMALS);
  const INITIAL_REPUTATION = 500;
  const MAX_REPUTATION = 1000;

  beforeEach(async function () {
    [owner, judge1, judge2, judge3, treasury] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USDC', 'USDC', USDC_DECIMALS);

    // Deploy JudgeRegistry
    JudgeRegistry = await ethers.getContractFactory('JudgeRegistry');
    judgeRegistry = await JudgeRegistry.deploy(await usdc.getAddress());

    // Fund judges
    await usdc.mint(judge1.address, ethers.parseUnits('1000', USDC_DECIMALS));
    await usdc.mint(judge2.address, ethers.parseUnits('1000', USDC_DECIMALS));
    await usdc.mint(judge3.address, ethers.parseUnits('1000', USDC_DECIMALS));
  });

  describe('Deployment', function () {
    it('Should set the correct USDC token', async function () {
      expect(await judgeRegistry.usdc()).to.equal(await usdc.getAddress());
    });

    it('Should set the correct owner', async function () {
      expect(await judgeRegistry.owner()).to.equal(owner.address);
    });

    it('Should have zero active judges initially', async function () {
      expect(await judgeRegistry.getActiveJudgeCount()).to.equal(0);
    });
  });

  describe('Judge Registration', function () {
    it('Should allow registration with minimum stake', async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);

      await expect(judgeRegistry.connect(judge1).register())
        .to.emit(judgeRegistry, 'JudgeRegistered')
        .withArgs(judge1.address, MINIMUM_STAKE, INITIAL_REPUTATION)
        .to.emit(judgeRegistry, 'JudgeActivated')
        .withArgs(judge1.address);

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.judgeAddress).to.equal(judge1.address);
      expect(judge.stakedAmount).to.equal(MINIMUM_STAKE);
      expect(judge.reputation).to.equal(INITIAL_REPUTATION);
      expect(judge.isActive).to.be.true;
      expect(judge.isRegistered).to.be.true;
      expect(await judgeRegistry.getActiveJudgeCount()).to.equal(1);
    });

    it('Should not allow double registration', async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();

      await expect(judgeRegistry.connect(judge1).register())
        .to.be.revertedWith('Already registered');
    });

    it('Should not allow registration without approval', async function () {
      await expect(judgeRegistry.connect(judge1).register())
        .to.be.reverted;
    });

    it('Should not allow registration when paused', async function () {
      await judgeRegistry.connect(owner).pause();
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);

      await expect(judgeRegistry.connect(judge1).register())
        .to.be.revertedWithCustomError(judgeRegistry, 'EnforcedPause');
    });
  });

  describe('Stake Management', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
    });

    it('Should allow increasing stake', async function () {
      const additionalStake = ethers.parseUnits('100', USDC_DECIMALS);
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), additionalStake);

      await expect(judgeRegistry.connect(judge1).increaseStake(additionalStake))
        .to.emit(judgeRegistry, 'StakeIncreased')
        .withArgs(judge1.address, MINIMUM_STAKE + additionalStake);

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.stakedAmount).to.equal(MINIMUM_STAKE + additionalStake);
    });

    it('Should not allow increasing stake by zero', async function () {
      await expect(judgeRegistry.connect(judge1).increaseStake(0))
        .to.be.revertedWith('Amount must be > 0');
    });

    it('Should allow partial stake withdrawal while staying active', async function () {
      const withdrawAmount = ethers.parseUnits('10', USDC_DECIMALS);
      const initialBalance = await usdc.balanceOf(judge1.address);

      await expect(judgeRegistry.connect(judge1).withdrawStake(withdrawAmount))
        .to.emit(judgeRegistry, 'StakeWithdrawn')
        .withArgs(judge1.address, withdrawAmount);

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.stakedAmount).to.equal(MINIMUM_STAKE - withdrawAmount);
      expect(judge.isActive).to.be.true;
      expect(await usdc.balanceOf(judge1.address)).to.equal(initialBalance + withdrawAmount);
    });

    it('Should deactivate judge when withdrawing below minimum', async function () {
      await expect(judgeRegistry.connect(judge1).withdrawStake(MINIMUM_STAKE))
        .to.emit(judgeRegistry, 'StakeWithdrawn')
        .withArgs(judge1.address, MINIMUM_STAKE)
        .to.emit(judgeRegistry, 'JudgeDeactivated')
        .withArgs(judge1.address);

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.stakedAmount).to.equal(0);
      expect(judge.isActive).to.be.false;
      expect(await judgeRegistry.getActiveJudgeCount()).to.equal(0);
    });

    it('Should not allow withdrawing more than staked', async function () {
      await expect(judgeRegistry.connect(judge1).withdrawStake(MINIMUM_STAKE + 1n))
        .to.be.revertedWith('Insufficient stake');
    });

    it('Should not allow withdrawing zero', async function () {
      await expect(judgeRegistry.connect(judge1).withdrawStake(0))
        .to.be.revertedWith('Amount must be > 0');
    });
  });

  describe('Reputation System', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
      await judgeRegistry.setEscrowJudge(owner.address);
    });

    it('Should increase reputation for correct verdicts', async function () {
      await expect(judgeRegistry.recordVerdictResult(judge1.address, true))
        .to.emit(judgeRegistry, 'ReputationUpdated')
        .withArgs(judge1.address, INITIAL_REPUTATION, INITIAL_REPUTATION + 10, 'Correct verdict');

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.reputation).to.equal(INITIAL_REPUTATION + 10);
      expect(judge.totalVerdicts).to.equal(1);
      expect(judge.correctVerdicts).to.equal(1);
      expect(judge.consecutiveMinority).to.equal(0);
    });

    it('Should decrease reputation for incorrect verdicts', async function () {
      await expect(judgeRegistry.recordVerdictResult(judge1.address, false))
        .to.emit(judgeRegistry, 'ReputationUpdated')
        .withArgs(judge1.address, INITIAL_REPUTATION, INITIAL_REPUTATION - 20, 'Disagreed with consensus');

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.reputation).to.equal(INITIAL_REPUTATION - 20);
      expect(judge.totalVerdicts).to.equal(1);
      expect(judge.correctVerdicts).to.equal(0);
      expect(judge.consecutiveMinority).to.equal(1);
    });

    it('Should cap reputation at maximum', async function () {
      // Need to make judge have high reputation first
      for (let i = 0; i < 60; i++) {
        await judgeRegistry.recordVerdictResult(judge1.address, true);
      }

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.reputation).to.equal(MAX_REPUTATION);
    });

    it('Should floor reputation at minimum', async function () {
      // Need to make judge have low reputation first
      for (let i = 0; i < 30; i++) {
        await judgeRegistry.recordVerdictResult(judge1.address, false);
      }

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.reputation).to.equal(0);
    });

    it('Should deactivate judge when reputation drops below threshold', async function () {
      // Need to decrease reputation below 300
      for (let i = 0; i < 11; i++) {
        await judgeRegistry.recordVerdictResult(judge1.address, false);
      }

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.reputation).to.be.lessThan(300);
      expect(judge.isActive).to.be.false;
    });
  });

  describe('Slashing', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
      await judgeRegistry.setEscrowJudge(owner.address);
    });

    it('Should slash judge after 3 consecutive minority verdicts', async function () {
      const initialStake = (await judgeRegistry.getJudge(judge1.address)).stakedAmount;
      const slashAmount = (initialStake * 10n) / 100n; // 10%

      // Three consecutive incorrect verdicts
      await judgeRegistry.recordVerdictResult(judge1.address, false);
      await judgeRegistry.recordVerdictResult(judge1.address, false);
      
      await expect(judgeRegistry.recordVerdictResult(judge1.address, false))
        .to.emit(judgeRegistry, 'JudgeSlashed')
        .to.emit(judgeRegistry, 'ReputationUpdated');

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.stakedAmount).to.equal(initialStake - slashAmount);
      expect(judge.consecutiveMinority).to.equal(0); // Reset after slash
    });

    it('Should reset consecutive minority counter after correct verdict', async function () {
      await judgeRegistry.recordVerdictResult(judge1.address, false);
      await judgeRegistry.recordVerdictResult(judge1.address, false);
      await judgeRegistry.recordVerdictResult(judge1.address, true);

      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.consecutiveMinority).to.equal(0);
    });
  });

  describe('Reactivation', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
      await judgeRegistry.setEscrowJudge(owner.address);
    });

    it('Should allow reactivation after deactivation', async function () {
      // Deactivate by withdrawing below minimum
      await judgeRegistry.connect(judge1).withdrawStake(MINIMUM_STAKE);
      
      let judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.isActive).to.be.false;

      // Re-stake and reactivate
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await expect(judgeRegistry.connect(judge1).reactivate())
        .to.emit(judgeRegistry, 'JudgeActivated')
        .withArgs(judge1.address);

      judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.isActive).to.be.true;
    });

    it('Should not allow reactivation if already active', async function () {
      await expect(judgeRegistry.connect(judge1).reactivate())
        .to.be.revertedWith('Already active');
    });

    it('Should not allow reactivation with insufficient stake', async function () {
      await judgeRegistry.connect(judge1).withdrawStake(MINIMUM_STAKE);
      await expect(judgeRegistry.connect(judge1).reactivate())
        .to.be.revertedWith('Insufficient stake');
    });

    it('Should not allow reactivation with low reputation', async function () {
      await judgeRegistry.connect(judge1).withdrawStake(MINIMUM_STAKE);
      
      // Re-stake
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      
      // But first tank reputation
      for (let i = 0; i < 15; i++) {
        await judgeRegistry.recordVerdictResult(judge1.address, false);
      }

      await expect(judgeRegistry.connect(judge1).reactivate())
        .to.be.revertedWith('Reputation too low');
    });
  });

  describe('View Functions', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await usdc.connect(judge2).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
      await judgeRegistry.connect(judge2).register();
    });

    it('Should return correct judge data', async function () {
      const judge = await judgeRegistry.getJudge(judge1.address);
      expect(judge.judgeAddress).to.equal(judge1.address);
    });

    it('Should return correct reputation', async function () {
      expect(await judgeRegistry.getReputation(judge1.address)).to.equal(INITIAL_REPUTATION);
    });

    it('Should correctly identify active judges', async function () {
      expect(await judgeRegistry.isActiveJudge(judge1.address)).to.be.true;
      expect(await judgeRegistry.isActiveJudge(judge3.address)).to.be.false;
    });

    it('Should return all active judges', async function () {
      const active = await judgeRegistry.getAllActiveJudges();
      expect(active.length).to.equal(2);
      expect(active).to.include(judge1.address);
      expect(active).to.include(judge2.address);
    });

    it('Should return eligible judges for panel', async function () {
      const eligible = await judgeRegistry.getEligibleJudges();
      expect(eligible.length).to.equal(2);
    });

    it('Should correctly check if judge can serve on panel', async function () {
      expect(await judgeRegistry.canServeOnPanel(judge1.address)).to.be.true;
      expect(await judgeRegistry.canServeOnPanel(judge3.address)).to.be.false;
    });
  });

  describe('Admin Functions', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
    });

    it('Should allow owner to set escrow judge', async function () {
      await judgeRegistry.connect(owner).setEscrowJudge(treasury.address);
      expect(await judgeRegistry.escrowJudge()).to.equal(treasury.address);
    });

    it('Should not allow non-owner to set escrow judge', async function () {
      await expect(judgeRegistry.connect(judge1).setEscrowJudge(treasury.address))
        .to.be.revertedWithCustomError(judgeRegistry, 'OwnableUnauthorizedAccount');
    });

    it('Should not allow setting zero address as escrow judge', async function () {
      await expect(judgeRegistry.connect(owner).setEscrowJudge(ethers.ZeroAddress))
        .to.be.revertedWith('Invalid address');
    });

    it('Should allow owner to manually deactivate judge', async function () {
      await expect(judgeRegistry.connect(owner).deactivateJudge(judge1.address))
        .to.emit(judgeRegistry, 'JudgeDeactivated')
        .withArgs(judge1.address);

      expect(await judgeRegistry.isActiveJudge(judge1.address)).to.be.false;
    });

    it('Should not allow non-owner to deactivate judge', async function () {
      await expect(judgeRegistry.connect(judge2).deactivateJudge(judge1.address))
        .to.be.revertedWithCustomError(judgeRegistry, 'OwnableUnauthorizedAccount');
    });

    it('Should allow owner to pause and unpause', async function () {
      await judgeRegistry.connect(owner).pause();
      expect(await judgeRegistry.paused()).to.be.true;

      await judgeRegistry.connect(owner).unpause();
      expect(await judgeRegistry.paused()).to.be.false;
    });

    it('Should allow emergency withdrawal when paused', async function () {
      await judgeRegistry.connect(owner).pause();
      
      const balance = await usdc.balanceOf(await judgeRegistry.getAddress());
      const initialTreasuryBalance = await usdc.balanceOf(treasury.address);

      await judgeRegistry.connect(owner).emergencyWithdraw(treasury.address);

      expect(await usdc.balanceOf(treasury.address)).to.equal(initialTreasuryBalance + balance);
      expect(await usdc.balanceOf(await judgeRegistry.getAddress())).to.equal(0);
    });

    it('Should not allow emergency withdrawal when not paused', async function () {
      await expect(judgeRegistry.connect(owner).emergencyWithdraw(treasury.address))
        .to.be.revertedWithCustomError(judgeRegistry, 'ExpectedPause');
    });
  });

  describe('Access Control', function () {
    beforeEach(async function () {
      await usdc.connect(judge1).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge1).register();
    });

    it('Should only allow escrow judge to record verdicts', async function () {
      await expect(judgeRegistry.connect(judge1).recordVerdictResult(judge1.address, true))
        .to.be.revertedWith('Only EscrowJudge');
    });

    it('Should only allow registered judges to apply decay', async function () {
      await expect(judgeRegistry.applyDecay(judge3.address))
        .to.be.revertedWith('Not registered');
    });

    it('Should only allow registered judges to increase stake', async function () {
      await expect(judgeRegistry.connect(judge3).increaseStake(100))
        .to.be.revertedWith('Not registered');
    });
  });
});
