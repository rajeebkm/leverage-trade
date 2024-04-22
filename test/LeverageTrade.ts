const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LeveragedSyntheticAsset", function () {
  let collateralToken: any;
  let syntheticAsset: any;
  let leverageTrade: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let price_decimals = 8;
  let decimalsCollateral: any;
  let decimalsSynthetic: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const initialSupply = 10000;
    collateralToken = await ethers.deployContract("FilamentToken", [initialSupply]);

    await collateralToken.waitForDeployment();

    console.log(
      `Collateral Token (Filament) deployed to ${collateralToken.target}`
    );

    const syntheticInitialSupply = 10000;
    syntheticAsset = await ethers.deployContract("SyntheticAsset", [syntheticInitialSupply]);

    await syntheticAsset.waitForDeployment();

    console.log(
      `Synthetic Asset deployed to ${syntheticAsset.target}`
    );
    // Let's say price decimals = 8
    leverageTrade = await ethers.deployContract("LeverageTrade", [collateralToken.target, syntheticAsset.target, 1 * (10 ** price_decimals), 100 * (10 ** price_decimals)]);

    await leverageTrade.waitForDeployment();

    console.log(
      `Leverage Trade contract deployed to ${leverageTrade.target}`
    );

    decimalsCollateral = await collateralToken.decimals();
    decimalsSynthetic = await syntheticAsset.decimals();

  });

  it("Should deploy with correct initial state", async function () {
    expect(await leverageTrade.collateralToken()).to.equal(collateralToken.target);
    expect(await leverageTrade.syntheticAssetPrice()).to.equal(100 * (10 ** price_decimals)); // $100
    expect(await leverageTrade.collateralPrice()).to.equal(1 * (10 ** price_decimals)); // $1
  });

  it("Should allow users to open a position with deposit collateral", async function () {
    const amountTransfer = BigInt(1000 * 10 ** (decimalsCollateral.toString())); // 1000
    await collateralToken.transfer(addr1.address, amountTransfer); // 1000
    expect(await collateralToken.balanceOf(addr1.address)).to.equal(BigInt(1000 * 10 ** (decimalsCollateral.toString())));
    await collateralToken.connect(addr1).approve(leverageTrade.target, BigInt(500 * 10 ** (decimalsCollateral.toString())));
    const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10
    await leverageTrade.connect(addr1).openPosition(syntheticAssetAmount, 2, true); // Synthetic Asset amount = 10, Leverage = 2, Long
    // Check position details
    let position = await leverageTrade.positions(addr1.address);
    expect(position.collateralAmount).to.equal(BigInt(500 * 10 ** (decimalsCollateral.toString()))); // 10 syntheticAssetAmount / 2 leverage / 1 collateralPrice = 5
    expect(position.syntheticAssetAmount).to.equal(syntheticAssetAmount);
    expect(position.leverage).to.equal(2);
    expect(position.isLong).to.equal(true);
    expect(position.entrySyntheticAssetValue).to.equal(BigInt(1000 * (10 ** price_decimals))); // 10 syntheticAssetAmount * 100 syntheticAssetPrice
    expect(position.entryCollateralValue).to.equal(BigInt(500 * (10 ** price_decimals))); // 500 collateralAmount * 1 collateralPrice
    // Check that the collateral is transferred from the user
    expect(await collateralToken.balanceOf(addr1.address)).to.equal(BigInt(500 * 10 ** (decimalsCollateral.toString()))); // Initial balance - deposited collateral
  });

  it("Should allow users to close a position and withdraw collateral", async function () {
    const amountTransfer = BigInt(1000 * 10 ** (decimalsCollateral.toString())); // 1000
    await collateralToken.transfer(addr1.address, amountTransfer); // 1000
    expect(await collateralToken.balanceOf(addr1.address)).to.equal(BigInt(1000 * 10 ** (decimalsCollateral.toString())));
    await collateralToken.connect(addr1).approve(leverageTrade.target, BigInt(500 * 10 ** (decimalsCollateral.toString())));
    const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10
    await leverageTrade.connect(addr1).openPosition(syntheticAssetAmount, 2, true); // Synthetic Asset amount = 10, Leverage = 2, Long
    await leverageTrade.connect(addr1).closePosition();
    // Check that the collateral is withdrawn
    expect(await collateralToken.balanceOf(addr1.address)).to.equal(BigInt(1000 * 10 ** (decimalsCollateral.toString()))); // Initial balance restored
  });

  it("Should not allow opening a position without setting prices", async function () {
    const leverageTrade_wrongContract = await ethers.deployContract("LeverageTrade", [collateralToken.target, syntheticAsset.target, 0 * (10 ** price_decimals), 0 * (10 ** price_decimals)]);
    await leverageTrade_wrongContract.waitForDeployment();
    const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10
    await expect(leverageTrade_wrongContract.connect(addr1).openPosition(syntheticAssetAmount, 2, true)).to.be.revertedWith("Prices not set");
  });

  it("Should not allow opening a position with zero synthetic asset amount", async function () {
    await collateralToken.connect(addr1).approve(leverageTrade.target, 100);
    // Zero synthetic asset amount
    const zeroSyntheticAssetAmount = BigInt(0 * 10 ** (decimalsSynthetic.toString())); // 0
    await expect(leverageTrade.connect(addr1).openPosition(zeroSyntheticAssetAmount, 2, true)).to.be.revertedWith("Synthetic asset amount must be greater than zero");
  });

  it("Should not allow opening a position with zero leverage", async function () {
    await collateralToken.connect(addr1).approve(leverageTrade.target, 100);
    const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10
    // Zero leverage
    await expect(leverageTrade.connect(addr1).openPosition(syntheticAssetAmount, 0, true)).to.be.revertedWith("Leverage must be greater than zero");
  });

  it("Should not allow opening a position without approving collateral", async function () {
    const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10
    // User does not approve collateral
    await expect(leverageTrade.connect(addr1).openPosition(syntheticAssetAmount, 2, true)).to.be.reverted;
  });

  // it("Should not allow opening a position with insufficient collateral for the synthetic asset amount", async function () {
  //   await collateralToken.connect(addr1).approve(leverageTrade.target, 1); // Insufficient collateral
  //   const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10
  //   await expect(leverageTrade.connect(addr1).openPosition(syntheticAssetAmount, 2, true)).to.be.revertedWith("Insufficient collateral for the synthetic asset amount");
  // });

  it("Should not allow closing a position if no position exists", async function () {
    await expect(leverageTrade.connect(addr1).closePosition()).to.be.revertedWith("No position exists");
  });

  it("Should emit events with the correct data", async function () {
    // Open a position and check emitted event
    const amountTransfer = BigInt(1000 * 10 ** (decimalsCollateral.toString())); // 1000
    await collateralToken.transfer(addr1.address, amountTransfer); // 1000
    expect(await collateralToken.balanceOf(addr1.address)).to.equal(BigInt(1000 * 10 ** (decimalsCollateral.toString())));
    await collateralToken.connect(addr1).approve(leverageTrade.target, BigInt(500 * 10 ** (decimalsCollateral.toString())));
    const syntheticAssetAmount = BigInt(10 * 10 ** (decimalsSynthetic.toString())); // 10

    await expect(leverageTrade.connect(addr1).openPosition(syntheticAssetAmount, 2, true)).to.emit(leverageTrade, "PositionOpened").withArgs(addr1.address, BigInt(500 * 10 ** (decimalsCollateral.toString())), syntheticAssetAmount, true, 100000000000, 50000000000);

  });
});
