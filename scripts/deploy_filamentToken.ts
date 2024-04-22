import { ethers } from "hardhat";

async function main() {
  const initialSupply = 10000;
  const collateralToken = await ethers.deployContract("FilamentToken", [initialSupply]);

  await collateralToken.waitForDeployment();

  console.log(
    `Collateral Token (Filament) deployed to ${collateralToken.target}`
  );

  const totalSupply = await collateralToken.totalSupply()

  console.log(
    `Filament deployed to ${await collateralToken.getAddress()} with an initialSupply ${totalSupply}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});