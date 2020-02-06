const Registry = artifacts.require('RegistryMock')
const StakedToken = artifacts.require('MockStakedToken')
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy')
const TrustToken = artifacts.require('MockTrustToken')
const TrueUSD = artifacts.require('TrueUSD')
const StakingOpportunityFactory = artifacts.require('StakingOpportunityFactory')
const StakedTokenProxyImplementation = artifacts.require('StakedTokenProxyImplementation')
const StakedTokenProxyMigrationMock = artifacts.require('StakedTokenProxyMigrationMock')

const bytes32 = require('../true-currencies/test/helpers/bytes32.js')
const assertRevert = require('../true-currencies/test/helpers/assertRevert.js')['default']
const writeAttributeFor = require('../true-currencies/registry/test/helpers/writeAttributeFor.js')

const IS_DEPOSIT_ADDRESS = bytes32('isDepositAddress')
const IS_REGISTERED_CONTRACT = bytes32('isRegisteredContract')
const PASSED_KYCAML = bytes32('hasPassedKYC/AML')
const BN = web3.utils.toBN
const ONE_ETHER = BN(1e18)
const ONE_HUNDRED_ETHER = BN(100).mul(ONE_ETHER)
const ONE_BITCOIN = BN(1e8)
const ONE_HUNDRED_BITCOIN = BN(100).mul(ONE_BITCOIN)
const DEFAULT_RATIO = BN(2000);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const { uint256Bytes32 } = require('./lib/abi.js')


contract('StakingOpportunityFactory', function(accounts) {
    const [_, owner, issuer, oneHundred, account1, account2, kycAccount, fakeLiquidator] = accounts
    beforeEach(async function() {
        this.registry = await Registry.new({ from: owner });
        this.rewardToken = await TrueUSD.new({ from: issuer });
        this.stakeToken = await TrustToken.new(this.registry.address, { from: issuer });
        await this.rewardToken.setRegistry(this.registry.address, {from: issuer})
        await this.rewardToken.mint(oneHundred, ONE_HUNDRED_ETHER, {from:issuer});
        await this.stakeToken.mint(oneHundred, ONE_HUNDRED_BITCOIN, {from:issuer});
        await this.registry.setAttributeValue(kycAccount, PASSED_KYCAML, 1, {from: owner})
        this.implementation = await StakedTokenProxyImplementation.new()
        this.factory = await StakingOpportunityFactory.new(this.registry.address, this.implementation.address, {from:owner})
        await this.registry.setAttributeValue(this.factory.address, writeAttributeFor(IS_REGISTERED_CONTRACT), 1, {from:owner})
        await this.registry.subscribe(IS_REGISTERED_CONTRACT, this.stakeToken.address, {from:owner})
        await this.registry.subscribe(IS_REGISTERED_CONTRACT, this.rewardToken.address, {from:owner})
    })
    describe('createStakingOpportunity', function() {
        it('creates staking opportunity', async function() {
            const created = await this.factory.createStakingOpportunity(this.stakeToken.address, this.rewardToken.address, fakeLiquidator)
            assert.equal(created.logs[0].event, "StakingOpportunity")
            const stakingOpportunityAddress = created.logs[0].args.opportunity
            const stakingOpportunity = await StakedToken.at(stakingOpportunityAddress)

            await this.stakeToken.transfer(stakingOpportunity.address, ONE_HUNDRED_BITCOIN, {from:oneHundred})
            assert(ONE_HUNDRED_BITCOIN.eq(await this.stakeToken.balanceOf.call(stakingOpportunity.address)))
            assert(ONE_HUNDRED_BITCOIN.mul(DEFAULT_RATIO).eq(await stakingOpportunity.totalSupply.call()))

            await this.rewardToken.transfer(stakingOpportunity.address, ONE_HUNDRED_ETHER, {from:oneHundred})
            await this.factory.syncAttributeValues(PASSED_KYCAML, [kycAccount], [stakingOpportunity.address])
            await stakingOpportunity.transfer(kycAccount, ONE_HUNDRED_BITCOIN.mul(DEFAULT_RATIO), { from: oneHundred})
            await stakingOpportunity.claimRewards(kycAccount, {from:kycAccount})
            assert(ONE_HUNDRED_ETHER.sub(await this.rewardToken.balanceOf.call(kycAccount)).lt(await stakingOpportunity.totalSupply.call()))
            assert.equal(await stakingOpportunity.owner.call(), ZERO_ADDRESS)
            assert.equal(await stakingOpportunity.pendingOwner.call(), ZERO_ADDRESS)
        })
    })
    describe('createProxyStakingOpportunity', function() {
        it('creates proxy staking opportunity', async function() {
            const created = await this.factory.createProxyStakingOpportunity(this.stakeToken.address, this.rewardToken.address, fakeLiquidator)
            assert.equal(created.logs[0].event, "StakingOpportunity")
            const stakingOpportunityAddress = created.logs[0].args.opportunity
            const stakingOpportunity = await StakedToken.at(stakingOpportunityAddress)

            await this.stakeToken.transfer(stakingOpportunity.address, ONE_HUNDRED_BITCOIN, {from:oneHundred})
            assert(ONE_HUNDRED_BITCOIN.eq(await this.stakeToken.balanceOf.call(stakingOpportunity.address)))
            assert(ONE_HUNDRED_BITCOIN.mul(DEFAULT_RATIO).eq(await stakingOpportunity.totalSupply.call()))

            // test award+claim
            await this.rewardToken.transfer(stakingOpportunity.address, ONE_HUNDRED_ETHER, {from:oneHundred})
            await this.factory.syncAttributeValues(PASSED_KYCAML, [kycAccount], [stakingOpportunity.address])
            await stakingOpportunity.transfer(kycAccount, ONE_HUNDRED_BITCOIN.mul(DEFAULT_RATIO), { from: oneHundred})
            await stakingOpportunity.claimRewards(kycAccount, {from:kycAccount})
            assert(ONE_HUNDRED_ETHER.sub(await this.rewardToken.balanceOf.call(kycAccount)).lt(await stakingOpportunity.totalSupply.call()))
            assert.equal(await stakingOpportunity.owner.call(), ZERO_ADDRESS)
            assert.equal(await stakingOpportunity.pendingOwner.call(), ZERO_ADDRESS)

            // proxy
            const stakingProxy = await OwnedUpgradeabilityProxy.at(stakingOpportunityAddress)
            assert.equal(await stakingProxy.proxyOwner.call(), this.factory.address)
            assert.equal(await stakingProxy.pendingProxyOwner.call(), ZERO_ADDRESS)
            assert.equal(await stakingProxy.implementation.call(), this.implementation.address)

            // migrate
            const migration1 = await StakedTokenProxyMigrationMock.new()
            await this.factory.appendMigration(migration1.address, '0x3f9c81c0' + uint256Bytes32(42), {from:owner}) // onUpgrade(42)
            await this.factory.migrateFrom(stakingProxy.address, 0, 1)
            const migratedContract = await StakedTokenProxyMigrationMock.at(stakingProxy.address)
            assert.equal(42, await migratedContract.importantNumber.call())
            assert.equal(migration1.address, await stakingProxy.implementation.call())

            // test award+claim
            await this.rewardToken.mint(oneHundred, ONE_HUNDRED_ETHER, {from:issuer});
            await this.rewardToken.transfer(stakingOpportunity.address, ONE_HUNDRED_ETHER, {from:oneHundred})
            await this.factory.syncAttributeValues(PASSED_KYCAML, [kycAccount], [stakingOpportunity.address])
            await stakingOpportunity.claimRewards(kycAccount, {from:kycAccount})
            assert(BN(2).mul(ONE_HUNDRED_ETHER).sub(await this.rewardToken.balanceOf.call(kycAccount)).lt(await stakingOpportunity.totalSupply.call()))
            assert.equal(await stakingOpportunity.owner.call(), ZERO_ADDRESS)
            assert.equal(await stakingOpportunity.pendingOwner.call(), ZERO_ADDRESS)

            // deploy another
            const second = await this.factory.createProxyStakingOpportunity(this.stakeToken.address, this.rewardToken.address, fakeLiquidator)
            assert.equal(second.logs[0].event, "StakingOpportunity")
            const stakingOpportunityAddress2 = second.logs[0].args.opportunity
            const stakingOpportunity2 = await StakedTokenProxyMigrationMock.at(stakingOpportunityAddress2)
            assert.equal(42, await stakingOpportunity2.importantNumber.call())
            const stakingProxy2 = await OwnedUpgradeabilityProxy.at(stakingOpportunityAddress2)
            assert.equal(migration1.address, await stakingProxy2.implementation.call())

            // stake, award, claim from the second
            await this.stakeToken.mint(oneHundred, ONE_HUNDRED_BITCOIN, {from:issuer})
            await this.stakeToken.transfer(stakingOpportunity2.address, ONE_HUNDRED_BITCOIN, {from:oneHundred})
            assert(ONE_HUNDRED_BITCOIN.eq(await this.stakeToken.balanceOf.call(stakingOpportunity2.address)))
            assert(ONE_HUNDRED_BITCOIN.mul(DEFAULT_RATIO).eq(await stakingOpportunity2.totalSupply.call()))
            await this.rewardToken.mint(oneHundred, ONE_HUNDRED_ETHER, {from:issuer});
            await this.rewardToken.transfer(stakingOpportunity2.address, ONE_HUNDRED_ETHER, {from:oneHundred})
            await stakingOpportunity2.transfer(kycAccount, ONE_HUNDRED_BITCOIN.mul(DEFAULT_RATIO), { from: oneHundred})
            await this.factory.syncAttributeValues(PASSED_KYCAML, [kycAccount], [stakingOpportunity2.address])
            await stakingOpportunity2.claimRewards(kycAccount, {from:kycAccount})
            assert(BN(3).mul(ONE_HUNDRED_ETHER).sub(await this.rewardToken.balanceOf.call(kycAccount)).lt(await stakingOpportunity2.totalSupply.call()))
        })
    })
})
