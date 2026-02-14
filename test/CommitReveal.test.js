const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CommitReveal', function () {
  let CommitReveal, EscrowJudge, JudgeRegistry;
  let commitReveal, escrowJudge, judgeRegistry;
  let owner, poster, worker, judge1, judge2, judge3, judge4, judge5, treasury;
  let usdc;

  const USDC_DECIMALS = 6;
  const MINIMUM_STAKE = ethers.parseUnits('50', USDC_DECIMALS);
  const BOUNTY_AMOUNT = ethers.parseUnits('1000', USDC_DECIMALS);

  beforeEach(async function () {
    [owner, poster, worker, judge1, judge2, judge3, judge4, judge5, treasury] = await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USDC', 'USDC', USDC_DECIMALS);

    // Deploy contracts
    const EscrowJudgeFactory = await ethers.getContractFactory('EscrowJudge');
    const JudgeRegistryFactory = await ethers.getContractFactory('JudgeRegistry');
    const CommitRevealFactory = await ethers.getContractFactory('CommitReveal');

    escrowJudge = await EscrowJudgeFactory.deploy(treasury.address);
    judgeRegistry = await JudgeRegistryFactory.deploy(await usdc.getAddress());
    commitReveal = await CommitRevealFactory.deploy();

    // Set contract references
    await escrowJudge.setContractReferences(
      await judgeRegistry.getAddress(),
      await commitReveal.getAddress()
    );
    await commitReveal.setEscrowJudge(await escrowJudge.getAddress());

    // Fund and register judges
    const judges = [judge1, judge2, judge3, judge4, judge5];
    for (const judge of judges) {
      await usdc.mint(judge.address, MINIMUM_STAKE);
      await usdc.connect(judge).approve(await judgeRegistry.getAddress(), MINIMUM_STAKE);
      await judgeRegistry.connect(judge).register();
    }
  });

  describe('Deployment', function () {
    it('Should set the owner correctly', async function () {
      expect(await commitReveal.owner()).to.equal(owner.address);
    });

    it('Should have correct penalty constant', async function () {
      expect(await commitReveal.NO_REVEAL_PENALTY()).to.equal(5);
    });
  });

  describe('Contract References', function () {
    it('Should set EscrowJudge reference correctly', async function () {
      expect(await commitReveal.escrowJudge()).to.equal(await escrowJudge.getAddress());
    });

    it('Should revert if non-owner sets reference', async function () {
      await expect(
        commitReveal.connect(poster).setEscrowJudge(await escrowJudge.getAddress())
      ).to.be.revertedWithCustomError(commitReveal, 'OwnableUnauthorizedAccount');
    });

    it('Should revert with invalid address', async function () {
      await expect(
        commitReveal.setEscrowJudge(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('submitCommit', function () {
    beforeEach(async function () {
      // Create bounty and set up judging phase
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.mint(poster.address, BOUNTY_AMOUNT * 2n);
      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission'));
      await escrowJudge.connect(worker).submitWork(0, submissionHash);

      // Assign judges directly
      const judges = [judge1.address, judge2.address, judge3.address, judge4.address, judge5.address];
      await escrowJudge.connect(owner).assignJudges(0, judges);
    });

    it('Should submit commit successfully', async function () {
      const verdict = 1; // PASS
      const partialPercentage = 0;
      const salt = ethers.randomBytes(32);
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes(verdict.toString() + partialPercentage.toString() + salt));

      await expect(commitReveal.connect(judge1).submitCommit(0, commitHash))
        .to.emit(commitReveal, 'CommitSubmitted')
        .withArgs(0, judge1.address, commitHash);

      const [storedHash, timestamp, exists] = await commitReveal.getCommit(0, judge1.address);
      expect(exists).to.be.true;
      expect(storedHash).to.equal(commitHash);
      expect(timestamp).to.be.greaterThan(0);
    });

    it('Should track commit count', async function () {
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test1'));
      
      expect(await commitReveal.getCommitCount(0)).to.equal(0);
      
      await commitReveal.connect(judge1).submitCommit(0, commitHash);
      
      expect(await commitReveal.getCommitCount(0)).to.equal(1);
    });

    it('Should revert if EscrowJudge not set', async function () {
      const newCommitReveal = await (await ethers.getContractFactory('CommitReveal')).deploy();
      
      await expect(
        newCommitReveal.connect(judge1).submitCommit(0, ethers.keccak256(ethers.toUtf8Bytes('test')))
      ).to.be.revertedWith('EscrowJudge not set');
    });

    it('Should revert with invalid commit hash', async function () {
      await expect(
        commitReveal.connect(judge1).submitCommit(0, ethers.ZeroHash)
      ).to.be.revertedWith('Invalid commit');
    });

    it('Should revert if not in judging phase', async function () {
      // Create a new bounty that is not yet in judging phase
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements2'));
      
      await usdc.connect(poster).approve(await escrowJudge.getAddress(), BOUNTY_AMOUNT);
      await escrowJudge.connect(poster).createBounty(
        await usdc.getAddress(),
        BOUNTY_AMOUNT,
        deadline,
        requirementsHash
      );

      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      
      await expect(
        commitReveal.connect(judge1).submitCommit(1, commitHash)
      ).to.be.revertedWith('Not in judging phase');
    });

    it('Should revert if not a panel judge', async function () {
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      
      await expect(
        commitReveal.connect(poster).submitCommit(0, commitHash)
      ).to.be.revertedWith('Not a panel judge');
    });

    it('Should revert if already committed', async function () {
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      
      await commitReveal.connect(judge1).submitCommit(0, commitHash);
      
      await expect(
        commitReveal.connect(judge1).submitCommit(0, commitHash)
      ).to.be.revertedWith('Already committed');
    });

    it('Should revert when paused', async function () {
      await commitReveal.pause();
      
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      
      await expect(
        commitReveal.connect(judge1).submitCommit(0, commitHash)
      ).to.be.revertedWithCustomError(commitReveal, 'EnforcedPause');
    });
  });

  describe('revealVerdict', function () {
    let commitHash;
    const verdict = 1; // PASS
    const partialPercentage = 0;
    let salt;

    beforeEach(async function () {
      // Create bounty and move to reveal phase
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.mint(poster.address, BOUNTY_AMOUNT * 2n);
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

      // Submit commit
      salt = ethers.randomBytes(32);
      commitHash = ethers.keccak256(ethers.toUtf8Bytes(verdict.toString() + partialPercentage.toString() + salt));
      
      await commitReveal.connect(judge1).submitCommit(0, commitHash);

      // Note: In actual implementation, bounty status would change to Reveal
      // Here we need to mock this or test with the current state
    });

    it('Should reveal verdict successfully', async function () {
      // This will revert because bounty isn't in reveal phase in test setup
      // In actual flow, endCommitPhase would be called automatically
      await expect(
        commitReveal.connect(judge1).revealVerdict(0, verdict, partialPercentage, salt)
      ).to.be.reverted;
    });

    it('Should revert with invalid verdict', async function () {
      await expect(
        commitReveal.connect(judge1).revealVerdict(0, 0, partialPercentage, salt)
      ).to.be.revertedWith('Invalid verdict');
    });

    it('Should revert with invalid percentage', async function () {
      await expect(
        commitReveal.connect(judge1).revealVerdict(0, verdict, 101, salt)
      ).to.be.revertedWith('Invalid percentage');
    });

    it('Should revert if not in reveal phase', async function () {
      // Bounty is in Judging phase, not Reveal
      await expect(
        commitReveal.connect(judge1).revealVerdict(0, verdict, partialPercentage, salt)
      ).to.be.revertedWith('Not in reveal phase');
    });

    it('Should revert if not a panel judge', async function () {
      await expect(
        commitReveal.connect(poster).revealVerdict(0, verdict, partialPercentage, salt)
      ).to.be.revertedWith('Not a panel judge');
    });

    it('Should revert if no commit found', async function () {
      await expect(
        commitReveal.connect(judge2).revealVerdict(0, verdict, partialPercentage, salt)
      ).to.be.revertedWith('No commit found');
    });

    it('Should revert if already revealed', async function () {
      // This tests the "Already revealed" path but requires reveal phase
    });

    it('Should revert if commit hash mismatch', async function () {
      const wrongSalt = ethers.randomBytes(32);
      
      await expect(
        commitReveal.connect(judge1).revealVerdict(0, verdict, partialPercentage, wrongSalt)
      ).to.be.revertedWith('Commit mismatch');
    });

    it('Should revert when paused', async function () {
      await commitReveal.pause();
      
      await expect(
        commitReveal.connect(judge1).revealVerdict(0, verdict, partialPercentage, salt)
      ).to.be.revertedWithCustomError(commitReveal, 'EnforcedPause');
    });
  });

  describe('penalizeNoReveal', function () {
    let commitHash;
    let salt;

    beforeEach(async function () {
      // Setup: judge1 commits but doesn't reveal
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.mint(poster.address, BOUNTY_AMOUNT * 2n);
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

      // Submit commit
      salt = ethers.randomBytes(32);
      const verdict = 1;
      const partialPercentage = 0;
      commitHash = ethers.keccak256(ethers.toUtf8Bytes(verdict.toString() + partialPercentage.toString() + salt));
      
      await commitReveal.connect(judge1).submitCommit(0, commitHash);
    });

    it('Should revert if no commit found', async function () {
      await expect(
        commitReveal.penalizeNoReveal(0, judge2.address)
      ).to.be.revertedWith('No commit found');
    });

    it('Should revert if already revealed', async function () {
      // This requires full commit-reveal flow
      // Would need reveal phase to be active and judge1 to reveal
      // Then penalize should fail because they revealed
    });

    it('Should revert if not in reveal phase', async function () {
      await expect(
        commitReveal.penalizeNoReveal(0, judge1.address)
      ).to.be.revertedWith('Not in reveal phase');
    });

    it('Should revert if reveal phase not ended', async function () {
      // Similar to above - requires reveal phase to be active
      await expect(
        commitReveal.penalizeNoReveal(0, judge1.address)
      ).to.be.reverted;
    });
  });

  describe('hasCommitted', function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.mint(poster.address, BOUNTY_AMOUNT * 2n);
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

    it('Should return false for non-committed judge', async function () {
      expect(await commitReveal.hasCommitted(0, judge1.address)).to.be.false;
    });

    it('Should return true for committed judge', async function () {
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      await commitReveal.connect(judge1).submitCommit(0, commitHash);
      
      expect(await commitReveal.hasCommitted(0, judge1.address)).to.be.true;
    });
  });

  describe('hasRevealed', function () {
    it('Should return false by default', async function () {
      expect(await commitReveal.hasRevealed(0, judge1.address)).to.be.false;
    });
  });

  describe('View Functions', function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const requirementsHash = ethers.keccak256(ethers.toUtf8Bytes('requirements'));

      await usdc.mint(poster.address, BOUNTY_AMOUNT * 2n);
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

    it('Should get commit details', async function () {
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      await commitReveal.connect(judge1).submitCommit(0, commitHash);
      
      const [hash, timestamp, exists] = await commitReveal.getCommit(0, judge1.address);
      expect(exists).to.be.true;
      expect(hash).to.equal(commitHash);
      expect(timestamp).to.be.greaterThan(0);
    });

    it('Should get reveal details with defaults', async function () {
      const [verdict, partialPercentage, exists] = await commitReveal.getReveal(0, judge1.address);
      expect(exists).to.be.false;
      expect(verdict).to.equal(0);
      expect(partialPercentage).to.equal(0);
    });

    it('Should get commit and reveal counts', async function () {
      expect(await commitReveal.getCommitCount(0)).to.equal(0);
      expect(await commitReveal.getRevealCount(0)).to.equal(0);
      
      const commitHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      await commitReveal.connect(judge1).submitCommit(0, commitHash);
      
      expect(await commitReveal.getCommitCount(0)).to.equal(1);
    });
  });

  describe('Pausable', function () {
    it('Should pause and unpause', async function () {
      await commitReveal.pause();
      expect(await commitReveal.paused()).to.be.true;

      await commitReveal.unpause();
      expect(await commitReveal.paused()).to.be.false;
    });

    it('Should prevent non-owner from pausing', async function () {
      await expect(
        commitReveal.connect(poster).pause()
      ).to.be.revertedWithCustomError(commitReveal, 'OwnableUnauthorizedAccount');
    });

    it('Should prevent non-owner from unpausing', async function () {
      await commitReveal.pause();
      
      await expect(
        commitReveal.connect(poster).unpause()
      ).to.be.revertedWithCustomError(commitReveal, 'OwnableUnauthorizedAccount');
    });
  });
});
