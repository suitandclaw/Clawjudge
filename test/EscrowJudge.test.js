const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('EscrowJudge', function () {
  let EscrowJudge, JudgeRegistry, JudgeSelection, CommitReveal;
  let escrowJudge, judgeRegistry, judgeSelection, commitReveal;
  let owner, poster, worker, judge1, judge2, judge3, judge4, judge5, treasury;
  let usdc;

  const USDC_DECIMALS = 6;
  const BOUNTY_AMOUNT = ethers.parseUnits('1000', USDC_DECIMALS);
  const MINIMUM_STAKE = ethers.parseUnits('50', USDC_DECIMALS);
  const FEE_BASIS_POINTS = 200; // 2%

  beforeEach(async function () {
    [owner, poster, worker, judge1, judge2, judge3, judge4, judge5, treasury] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USDC', 'USDC', USDC_DECIMALS);

    // Deploy contracts
    EscrowJudge = await ethers.getContractFactory('EscrowJudge');
    JudgeRegistry = await ethers.getContractFactory('JudgeRegistry');
    JudgeSelection = await ethers.getContractFactory('JudgeSelection');
    CommitReveal = await ethers.getContractFactory('CommitReveal');

    escrowJudge = await EscrowJudge.deploy(treasury.address);
    judgeRegistry = await JudgeRegistry.deploy(await usdc.getAddress());
    judgeSelection = await JudgeSelection.deploy();
    commitReveal = await CommitReveal.deploy();

    // Set contract references
    await escrowJudge.setContractReferences(
      await judgeRegistry.getAddress(),
      await commitReveal.getAddress()
    );
    await judgeRegistry.setEscrowJudge(await escrowJudge.getAddress());
    await judgeSelection.setContractReferences(
      await judgeRegistry.getAddress(),
      await escrowJudge.getAddress()
    );
    await commitReveal.setEscrowJudge(await escrowJudge.getAddress());

    // Fund accounts
    await usdc.mint(poster.address, ethers.parseUnits('10000', USDC_DECIMALS));
    await usdc.mint(worker.address, ethers.parseUnits('1000', USDC_DECIMALS));
    
    // Register judges
    const judges = [judge1, judge2, judge3, judge4, judge5];
    for (const judge of judges) {
      await usdc.mint(judge.address, MINIMUM_STAKE);
      await usdc.connect(judge).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge).register();
    }
  });

  describe('Bounty Creation', function () {
    it('Should create a bounty with USDC', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      
      await expect(
        escrowJudge.connect(poster).createBounty(
          await usdc.getAddress(),
          BOUNTY_AMOUNT,
          deadline,
          requirementsHash
        )
      )
        .to.emit(escrowJudge, 'BountyCreated')
        .withArgs(0, poster.address, BOUNTY_AMOUNT, await usdc.getAddress(), deadline);

      const bounty = await escrowJudge.bounties(0);
      expect(bounty.poster).to.equal(poster.address);
      expect(bounty.amount).to.equal(BOUNTY_AMOUNT);
      expect(bounty.status).to.equal(0); // Pending
    });

    it('Should calculate fee correctly', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const bounty = await escrowJudge.bounties(0);
      const expectedFee = (BOUNTY_AMOUNT * FEE_BASIS_POINTS) / 10000;
      expect(bounty.feeAmount).to.equal(expectedFee);
    });

    it('Should revert if insufficient judges', async function () {
      // Deploy new registry with no judges
      const newRegistry = await JudgeRegistry.deploy(await usdc.getAddress());
      await escrowJudge.setContractReferences(
        await newRegistry.getAddress(),
        await commitReveal.getAddress()
      );

      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      
      await expect(
        escrowJudge.connect(poster).createBounty(
          await usdc.getAddress(),
          BOUNTY_AMOUNT,
          deadline,
          requirementsHash
        )
      ).to.be.revertedWith('Insufficient judges');
    });

    it('Should revert if deadline is in past', async function () {
      const deadline = Math.floor(Date.now() / 1000) - 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      
      await expect(
        escrowJudge.connect(poster).createBounty(
          await usdc.getAddress(),
          BOUNTY_AMOUNT,
          deadline,
          requirementsHash
        )
      ).to.be.revertedWith('Deadline must be in future');
    });
  });

  describe('Work Submission', function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );
    });

    it('Should allow work submission', async function () {
      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));

      await expect(
        escrowJudge.connect(worker).submitWork(0, submissionHash)
      )
        .to.emit(escrowJudge, 'WorkSubmitted')
        .withArgs(0, worker.address, submissionHash);

      const bounty = await escrowJudge.bounties(0);
      expect(bounty.worker).to.equal(worker.address);
      expect(bounty.status).to.equal(1); // Submitted
    });

    it('Should revert if poster tries to submit', async function () {
      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));

      await expect(
        escrowJudge.connect(poster).submitWork(0, submissionHash)
      ).to.be.revertedWith('Poster cannot submit');
    });

    it('Should revert if deadline passed', async function () {
      // Advance time
      await ethers.provider.send('evm_increaseTime', [86401]);
      await ethers.provider.send('evm_mine');

      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));

      await expect(
        escrowJudge.connect(worker).submitWork(0, submissionHash)
      ).to.be.revertedWith('Deadline passed');
    });
  });

  describe('Judge Assignment', function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));
      await escrowJudge.connect(worker).submitWork(0, submissionHash);
    });

    it('Should assign judges', async function () {
      const judges = [judge1.address, judge2.address, judge3.address, judge4.address, judge5.address];

      await expect(
        escrowJudge.connect(owner).assignJudges(0, judges)
      )
        .to.emit(escrowJudge, 'JudgesAssigned')
        .withArgs(0, judges, await ethers.provider.getBlock('latest').then(b => b.timestamp + 86400), await ethers.provider.getBlock('latest').then(b => b.timestamp + 172800));

      const bounty = await escrowJudge.bounties(0);
      expect(bounty.status).to.equal(2); // Judging
    });

    it('Should revert if not enough judges', async function () {
      const judges = [judge1.address, judge2.address, judge3.address];

      await expect(
        escrowJudge.connect(owner).assignJudges(0, judges)
      ).to.be.revertedWith('Must assign 5 judges');
    });
  });

  describe('Verdict Processing', function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));
      await escrowJudge.connect(worker).submitWork(0, submissionHash);

      const judges = [judge1.address, judge2.address, judge3.address, judge4.address, judge5.address];
      await escrowJudge.connect(owner).assignJudges(0, judges);
    });

    it('Should process PASS verdict with supermajority', async function () {
      // Record 4 PASS verdicts (supermajority)
      await escrowJudge.connect(owner).recordVerdict(0, judge1.address, 1, 0); // Pass
      await escrowJudge.connect(owner).recordVerdict(0, judge2.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge3.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge4.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge5.address, 2, 0); // Fail

      // Advance past reveal deadline
      await ethers.provider.send('evm_increaseTime', [172801]);
      await ethers.provider.send('evm_mine');

      const initialTreasuryBalance = await usdc.balanceOf(treasury.address);

      await expect(escrowJudge.connect(owner).processVerdict(0))
        .to.emit(escrowJudge, 'FundsReleased')
        .withArgs(0, 1, BOUNTY_AMOUNT - (BOUNTY_AMOUNT * 200n / 10000n), BOUNTY_AMOUNT * 200n / 10000n);

      const finalTreasuryBalance = await usdc.balanceOf(treasury.address);
      expect(finalTreasuryBalance - initialTreasuryBalance).to.equal(BOUNTY_AMOUNT * 200n / 10000n);

      const bounty = await escrowJudge.bounties(0);
      expect(bounty.status).to.equal(4); // Completed
    });

    it('Should initiate dispute without supermajority', async function () {
      // 3 PASS, 2 FAIL - no supermajority
      await escrowJudge.connect(owner).recordVerdict(0, judge1.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge2.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge3.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge4.address, 2, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge5.address, 2, 0);

      await ethers.provider.send('evm_increaseTime', [172801]);
      await ethers.provider.send('evm_mine');

      await expect(escrowJudge.connect(owner).processVerdict(0))
        .to.emit(escrowJudge, 'DisputeInitiated');

      const bounty = await escrowJudge.bounties(0);
      expect(bounty.status).to.equal(5); // Disputed
    });
  });

  describe('Dispute Resolution', function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));
      await escrowJudge.connect(worker).submitWork(0, submissionHash);

      const judges = [judge1.address, judge2.address, judge3.address, judge4.address, judge5.address];
      await escrowJudge.connect(owner).assignJudges(0, judges);

      // Create dispute
      await escrowJudge.connect(owner).recordVerdict(0, judge1.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge2.address, 1, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge3.address, 2, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge4.address, 2, 0);
      await escrowJudge.connect(owner).recordVerdict(0, judge5.address, 2, 0);

      await ethers.provider.send('evm_increaseTime', [172801]);
      await ethers.provider.send('evm_mine');

      await escrowJudge.connect(owner).processVerdict(0);
    });

    it('Should resolve dispute with PASS', async function () {
      await expect(
        escrowJudge.connect(owner).resolveDispute(0, 1, 0) // Pass
      )
        .to.emit(escrowJudge, 'DisputeResolved')
        .withArgs(0, 1, 0);

      const bounty = await escrowJudge.bounties(0);
      expect(bounty.status).to.equal(4); // Completed
    });
  });

  describe('Cancellation', function () {
    it('Should allow poster to cancel before submission', async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const initialBalance = await usdc.balanceOf(poster.address);

      await expect(
        escrowJudge.connect(poster).cancelBounty(0)
      )
        .to.emit(escrowJudge, 'BountyCancelled')
        .withArgs(0);

      const finalBalance = await usdc.balanceOf(poster.address);
      expect(finalBalance - initialBalance).to.be.closeTo(BOUNTY_AMOUNT, 1000n); // Allow for gas cost rounding
    });
  });

  describe('Pausable', function () {
    it('Should pause and unpause', async function () {
      await escrowJudge.connect(owner).pause();
      expect(await escrowJudge.paused()).to.be.true;

      await escrowJudge.connect(owner).unpause();
      expect(await escrowJudge.paused()).to.be.false;
    });

    it('Should prevent bounty creation when paused', async function () {
      await escrowJudge.connect(owner).pause();

      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);

      await expect(
        escrowJudge.connect(poster).createBounty(
          await usdc.getAddress(),
          BOUNTY_AMOUNT,
          deadline,
          requirementsHash
        )
      ).to.be.revertedWithCustomError(escrowJudge, 'EnforcedPause');
    });
  });
});
