// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IERC20.sol";
import "hardhat/console.sol";

contract LeverageTrade {

    struct Position {
        uint256 collateralAmount;
        uint256 syntheticAssetAmount;
        uint256 leverage;
        bool isLong;
        uint256 entrySyntheticAssetValue;
        uint256 entryCollateralValue;
    }

    IERC20 public collateralToken;
    IERC20 public syntheticAsset;
    uint256 public syntheticAssetPrice;
    uint256 public collateralPrice;
    mapping(address => Position) public positions;

    // Events
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event PositionOpened(address indexed user, uint256 collateralAmount, uint256 syntheticAssetAmount, bool isLong, uint256 entrySyntheticAssetValue, uint256 entryCollateralValue);
    event PositionClosed(address indexed user, uint256 collateralAmount, uint256 syntheticAssetAmount, int256 profitLoss);

    // Constructor
    constructor(address _collateralToken, address _syntheticAsset, uint256 _collateralPrice, uint256 _syntheticAssetPrice) {
        collateralToken = IERC20(_collateralToken);
        syntheticAsset = IERC20(_syntheticAsset);
        collateralPrice = _collateralPrice;
        syntheticAssetPrice = _syntheticAssetPrice;
    }

    // Modifier to ensure prices are set
    modifier pricesSet() {
        require(syntheticAssetPrice > 0 && collateralPrice > 0, "Prices not set");
        _;
    }

    // Modifier to ensure no existing position
    modifier noExistingPosition() {
        require(positions[msg.sender].collateralAmount == 0, "Position already exists");
        _;
    }

    // Function to open a leveraged position
    function openPosition(uint256 syntheticAssetAmount, uint256 leverage, bool isLong) external pricesSet noExistingPosition {
        require(syntheticAssetAmount > 0, "Synthetic asset amount must be greater than zero");
        require(leverage > 0, "Leverage must be greater than zero");
        uint8 syntheticAssetDecimals = syntheticAsset.decimals();
        uint8 collateralTokenDecimals = collateralToken.decimals();

        uint256 entryCollateralValue = (syntheticAssetAmount * syntheticAssetPrice) / (leverage * (10 ** syntheticAssetDecimals));
        uint256 collateralAmount = (entryCollateralValue * (10 ** collateralTokenDecimals))/ collateralPrice; // 500 000000000000000000
        uint256 entrySyntheticAssetValue = (syntheticAssetAmount * syntheticAssetPrice) / (10 ** syntheticAssetDecimals);

        if (isLong) {
            require((entryCollateralValue * leverage) >= entrySyntheticAssetValue, "Insufficient collateral for the synthetic asset amount");
        } else {
            require((entrySyntheticAssetValue * leverage) >= entryCollateralValue, "Insufficient synthetic asset for the collateral amount");
        }
        // Deposit collateral from the user
        _depositCollateral(collateralAmount);

        positions[msg.sender] = Position(collateralAmount, syntheticAssetAmount, leverage, isLong, entrySyntheticAssetValue, entryCollateralValue);
        emit PositionOpened(msg.sender, collateralAmount, syntheticAssetAmount, isLong, entrySyntheticAssetValue, entryCollateralValue);
    }

    // Function to calculate profit or loss
    function _calculateProfitLoss(address user) internal view returns (int256) {
        Position storage position = positions[user];
        require(position.collateralAmount > 0, "No position exists");
        uint8 syntheticAssetDecimals = syntheticAsset.decimals();
        uint8 collateralTokenDecimals = collateralToken.decimals();

        uint256 currentSyntheticAssetValue = (position.syntheticAssetAmount * syntheticAssetPrice) / syntheticAssetDecimals;
        uint256 currentCollateralValue = (position.collateralAmount * collateralPrice) / collateralTokenDecimals;
        uint256 entryCollateralValue = position.entryCollateralValue;
        
        int256 profitLoss;
        if (position.isLong) {
            // Profit/Loss = (Current Synthetic Asset Value - Entry Synthetic Asset Value) - (Current Collateral Value - Entry Collateral Value)
            profitLoss = int256(currentSyntheticAssetValue - position.entrySyntheticAssetValue) - int256(currentCollateralValue - entryCollateralValue);
        } else {
            // Profit/Loss = (Entry Synthetic Asset Value - Current Synthetic Asset Value) - (Current Collateral Value - Entry Collateral Value)
            profitLoss = int256(position.entrySyntheticAssetValue - currentSyntheticAssetValue) - int256(currentCollateralValue - entryCollateralValue);
        }

        return profitLoss;
    }

    // Function to close a leveraged position
    function closePosition() external {
        Position storage position = positions[msg.sender];
        require(position.collateralAmount > 0, "No position exists");

        int256 profitLoss = _calculateProfitLoss(msg.sender);
        uint8 collateralTokenDecimals = collateralToken.decimals();

        // Transfer profit or loss
        if (profitLoss > 0) {
            // User receives initial collateral plus profit
            // collateralToken.transfer(msg.sender, (position.entryCollateralValue + uint256(profitLoss)) / collateralPrice);
            _withdrawCollateral(((position.entryCollateralValue + uint256(profitLoss)) *  collateralTokenDecimals)/ collateralPrice);
        } else if (profitLoss < 0) {
            // User loses initial collateral plus loss
            // collateralToken.transferFrom(msg.sender, address(this), (position.entryCollateralValue - uint256(-profitLoss)) / collateralPrice);
            _withdrawCollateral(((position.entryCollateralValue - uint256(-profitLoss)) *  collateralTokenDecimals)/ collateralPrice);
        } else {
            // This should not happen, but in case of precision issues or unexpected scenarios, return initial collateral
            // collateralToken.transfer(msg.sender, position.entryCollateralValue);
            _withdrawCollateral((position.entryCollateralValue *  collateralTokenDecimals) / collateralPrice);
        }

        emit PositionClosed(msg.sender, position.collateralAmount, position.syntheticAssetAmount, profitLoss);

        // Clear position
        delete positions[msg.sender];
    }

       // Internal function to deposit collateral
    function _depositCollateral(uint256 amount) internal {
        require(amount > 0, "Amount must be greater than zero");
        collateralToken.transferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, amount);
    }

    // Function to withdraw collateral
    function _withdrawCollateral(uint256 amount) internal {
        require(amount > 0, "Amount must be greater than zero");
        Position storage position = positions[msg.sender];
        require(position.collateralAmount >= amount, "Insufficient collateral");

        collateralToken.transfer(msg.sender, amount);
        position.collateralAmount -= amount;
        emit CollateralWithdrawn(msg.sender, amount);
    }
}
