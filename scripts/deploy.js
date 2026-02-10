const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('Deploying ClawJudge contracts with account:', deployer.address);
  console.log('Account balance:', (await deployer.provider.getBalance(deployer.address)).toString());

  const network = hre.network.name;
  console.log('Network:', network);

  // USDC addresses
  const USDC_ADDRESSES = {
    baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet USDC
  };

  const usdcAddress = USDC_ADDRESSES[network];
  if (!usdcAddress && network !== 'hardhat') {
    throw new Error(`USDC address not configured for network: ${network}`);
  }

  // Deploy contracts
  console.log('\n--- Deploying Contracts ---\n');

  // 1. JudgeRegistry
  console.log('Deploying JudgeRegistry...');
  const JudgeRegistry = await hre.ethers.getContractFactory('JudgeRegistry');
  const judgeRegistry = await JudgeRegistry.deploy(
    network === 'hardhat' ? deployer.address : usdcAddress
  );
  await judgeRegistry.waitForDeployment();
  console.log('JudgeRegistry deployed to:', await judgeRegistry.getAddress());

  // 2. EscrowJudge
  console.log('Deploying EscrowJudge...');
  const EscrowJudge = await hre.ethers.getContractFactory('EscrowJudge');
  const escrowJudge = await EscrowJudge.deploy(deployer.address);
  await escrowJudge.waitForDeployment();
  console.log('EscrowJudge deployed to:', await escrowJudge.getAddress());

  // 3. JudgeSelection
  console.log('Deploying JudgeSelection...');
  const JudgeSelection = await hre.ethers.getContractFactory('JudgeSelection');
  const judgeSelection = await JudgeSelection.deploy();
  await judgeSelection.waitForDeployment();
  console.log('JudgeSelection deployed to:', await judgeSelection.getAddress());

  // 4. CommitReveal
  console.log('Deploying CommitReveal...');
  const CommitReveal = await hre.ethers.getContractFactory('CommitReveal');
  const commitReveal = await CommitReveal.deploy();
  await commitReveal.waitForDeployment();
  console.log('CommitReveal deployed to:', await commitReveal.getAddress());

  // Set contract references
  console.log('\n--- Setting Contract References ---\n');

  console.log('Setting EscrowJudge references...');
  await escrowJudge.setContractReferences(
    await judgeRegistry.getAddress(),
    await commitReveal.getAddress()
  );

  console.log('Setting JudgeRegistry EscrowJudge...');
  await judgeRegistry.setEscrowJudge(await escrowJudge.getAddress());

  console.log('Setting JudgeSelection references...');
  await judgeSelection.setContractReferences(
    await judgeRegistry.getAddress(),
    await escrowJudge.getAddress()
  );

  console.log('Setting CommitReveal EscrowJudge...');
  await commitReveal.setEscrowJudge(await escrowJudge.getAddress());

  // Save deployment info
  const deploymentInfo = {
    network,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      JudgeRegistry: await judgeRegistry.getAddress(),
      EscrowJudge: await escrowJudge.getAddress(),
      JudgeSelection: await judgeSelection.getAddress(),
      CommitReveal: await commitReveal.getAddress(),
    },
    usdc: usdcAddress || 'N/A (hardhat)',
  };

  const deploymentPath = path.join(__dirname, '..', `deployment-${network}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\nDeployment info saved to:', deploymentPath);

  console.log('\n--- Deployment Complete ---\n');
  console.log('Contract Addresses:');
  console.log('===================');
  console.log('JudgeRegistry:', await judgeRegistry.getAddress());
  console.log('EscrowJudge:', await escrowJudge.getAddress());
  console.log('JudgeSelection:', await judgeSelection.getAddress());
  console.log('CommitReveal:', await commitReveal.getAddress());

  // Verify on basescan if not hardhat
  if (network !== 'hardhat') {
    console.log('\n--- Verifying on Basescan ---\n');
    console.log('Run the following commands to verify:');
    console.log(`npx hardhat verify --network ${network} ${await judgeRegistry.getAddress()} ${usdcAddress}`);
    console.log(`npx hardhat verify --network ${network} ${await escrowJudge.getAddress()} ${deployer.address}`);
    console.log(`npx hardhat verify --network ${network} ${await judgeSelection.getAddress()}`);
    console.log(`npx hardhat verify --network ${network} ${await commitReveal.getAddress()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
