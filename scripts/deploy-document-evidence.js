const hre = require('hardhat');

async function main() {
  const registry = await hre.ethers.deployContract('DocumentEvidenceRegistry');
  await registry.waitForDeployment();

  console.log(
    `DOCUMENT_EVIDENCE_CONTRACT_ADDRESS=${await registry.getAddress()}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Contract deployment failed.');
  process.exitCode = 1;
});
