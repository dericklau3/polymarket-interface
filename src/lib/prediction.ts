import {
  Contract,
  Interface,
  keccak256,
  parseUnits,
  solidityPacked,
  toUtf8Bytes,
  type ContractTransactionResponse,
  type JsonRpcSigner,
} from 'ethers'

export const CONTRACTS = {
  conditionalTokens: '0x5608E0FCE82574071dd083B2a644A24bbE8847e7',
  umaCtfAdapter: '0x6bF08d27C6C5Ae1d6B27171931cc93c2Ea70CD9A',
  usdc: '0x8542FC3a56280a3795990E243c2f99Eb2eBcD51E',
} as const

const UMA_CTF_ADAPTER_ABI = [
  'event QuestionInitialized(bytes32 indexed questionID,uint256 indexed requestTimestamp,address indexed creator,bytes ancillaryData,address rewardToken,uint256 reward,uint256 proposalBond)',
  'function initialize(bytes ancillaryData,address rewardToken,uint256 reward,uint256 proposalBond,uint256 liveness) returns (bytes32 questionID)',
] as const

const CONDITIONAL_TOKENS_ABI = [
  'event ConditionPreparation(bytes32 indexed conditionId,address indexed oracle,bytes32 indexed questionId,uint256 outcomeSlotCount)',
] as const

const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 value) returns (bool)',
] as const

export type CreatePredictionInput = {
  signer: JsonRpcSigner
  title: string
  description: string
  outcomes: string[]
  rewardToken: string
  reward: string
  proposalBond: string
  customLiveness?: string
}

export type CreatePredictionResult = {
  txHash: string
  adapterVersion: 'v2' | 'v3'
  questionId: string
  conditionId: string
}

function buildAncillaryData(title: string, description: string, outcomes: string[]): Uint8Array {
  const resolutionData = `p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to ${outcomes[1]}, p2 to ${outcomes[0]}, p3 to unknown/50-50.`
  return toUtf8Bytes(`q: title: ${title}, description: ${description} res_data: ${resolutionData}`)
}

const REWARD_TOKEN_DECIMALS = 6

function parseTokenAmount(amount: string): bigint {
  const trimmed = amount.trim()
  return trimmed ? parseUnits(trimmed, REWARD_TOKEN_DECIMALS) : 0n
}

function sumTokenAmounts(amounts: string[]): bigint {
  return amounts.reduce((total, amount) => total + parseTokenAmount(amount), 0n)
}

function getEventArg(
  receipt: { logs: Array<{ topics: readonly string[]; data: string }> },
  iface: Interface,
  eventName: string,
  arg: string,
): string | null {
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed?.name === eventName) {
        return String(parsed.args[arg])
      }
    } catch {
      continue
    }
  }

  return null
}

function computeConditionId(questionId: string, outcomeSlotCount: number): string {
  return keccak256(
    solidityPacked(['address', 'bytes32', 'uint256'], [CONTRACTS.umaCtfAdapter, questionId, outcomeSlotCount]),
  )
}

export async function createPrediction(input: CreatePredictionInput): Promise<CreatePredictionResult> {
  const contract = new Contract(CONTRACTS.umaCtfAdapter, UMA_CTF_ADAPTER_ABI, input.signer)
  const ancillaryData = buildAncillaryData(input.title, input.description, input.outcomes)
  const reward = parseTokenAmount(input.reward)
  const proposalBond = parseTokenAmount(input.proposalBond)
  const liveness = input.customLiveness?.trim() ? BigInt(input.customLiveness.trim()) : 0n

  const tx: ContractTransactionResponse = await contract['initialize(bytes,address,uint256,uint256,uint256)'](
    ancillaryData,
    input.rewardToken,
    reward,
    proposalBond,
    liveness,
  )

  const receipt = await tx.wait()
  if (!receipt) {
    throw new Error('Transaction receipt not available')
  }

  const adapterInterface = new Interface(UMA_CTF_ADAPTER_ABI)
  const ctfInterface = new Interface(CONDITIONAL_TOKENS_ABI)
  const questionId = getEventArg(receipt, adapterInterface, 'QuestionInitialized', 'questionID')

  if (!questionId) {
    throw new Error('QuestionInitialized event not found in receipt')
  }

  const conditionId =
    getEventArg(receipt, ctfInterface, 'ConditionPreparation', 'conditionId') ??
    computeConditionId(questionId, input.outcomes.length)

  return {
    txHash: receipt.hash,
    adapterVersion: 'v3',
    questionId,
    conditionId,
  }
}

export async function ensureRewardTokenAllowance(
  signer: JsonRpcSigner,
  owner: string,
  requiredAmounts: string[],
): Promise<{ approved: boolean; txHash: string | null }> {
  const token = new Contract(CONTRACTS.usdc, ERC20_ABI, signer)
  const required = sumTokenAmounts(requiredAmounts)
  const currentAllowance = (await token.allowance(owner, CONTRACTS.umaCtfAdapter)) as bigint

  if (currentAllowance >= required) {
    return { approved: false, txHash: null }
  }

  const tx = await token.approve(CONTRACTS.umaCtfAdapter, required)
  const receipt = await tx.wait()

  return {
    approved: true,
    txHash: receipt?.hash ?? tx.hash,
  }
}
