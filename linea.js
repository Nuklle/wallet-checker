import './common.js'
import {wait, sleep, random, readWallets, writeLineToFile, getBalance, timestampToDate} from './common.js'
import axios from "axios"
import { Table } from 'console-table-printer'
import { createObjectCsvWriter } from 'csv-writer'
import moment from 'moment'
import cliProgress from 'cli-progress'

const csvWriter = createObjectCsvWriter({
    path: './results/linea.csv',
    header: [
        { id: 'n', title: '№'},
        { id: 'wallet', title: 'wallet'},
        { id: 'ETH', title: 'ETH'},
        { id: 'USDC', title: 'USDC'},
        { id: 'USDT', title: 'USDT'},
        { id: 'DAI', title: 'DAI'},
        { id: 'TX Count', title: 'TX Count'},
        { id: 'Contracts', title: 'Contracts'},
        { id: 'Unique days', title: 'Unique days'},
        { id: 'Unique weeks', title: 'Unique weeks'},
        { id: 'Unique months', title: 'Unique months'},
        { id: 'First tx', title: 'First tx'},
        { id: 'Last tx', title: 'Last tx'},
        { id: 'Total gas spent', title: 'Total gas spent'}
    ]
})

const p = new Table({
  columns: [
    { name: 'n', color: 'green', alignment: "right"},
    { name: 'wallet', color: 'green', alignment: "right"},
    { name: 'ETH', alignment: 'right', color: 'cyan'},
    { name: 'USDC', alignment: 'right', color: 'cyan'},
    { name: 'USDT', alignment: 'right', color: 'cyan'},
    { name: 'DAI', alignment: 'right', color: 'cyan'},
    { name: 'TX Count', alignment: 'right', color: 'cyan'},
    { name: 'Contracts', alignment: 'right', color: 'cyan'},
    { name: 'Unique days', alignment: 'right', color: 'cyan'},
    { name: 'Unique weeks', alignment: 'right', color: 'cyan'},
    { name: 'Unique months', alignment: 'right', color: 'cyan'},
    { name: 'First tx', alignment: 'right', color: 'cyan'},
    { name: 'Last tx', alignment: 'right', color: 'cyan'},
    { name: 'Total gas spent', alignment: 'right', color: 'cyan'},
  ]
})

const contracts = [
    {
        token: 'USDC',
        address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
        decimals: 6
    },
    {
        token: 'USDT',
        address: '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
        decimals: 6
    },
    {
        token: 'DAI',
        address: '0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5',
        decimals: 18
    },
    {
        token: 'BUSD',
        address: '0x7d43AABC515C356145049227CeE54B608342c0ad',
        decimals: 18
    }
]

const apiUrl = "https://explorer.linea.build/api"

let stats = []
const filterSymbol = ['ETH', 'USDT', 'USDC', 'DAI']

async function getBalances(wallet) {
    await axios.get(apiUrl, {
        params: {
            module: 'account',
            action: 'balance',
            address: wallet
        }
    }).then(response => {
        stats[wallet].balances['ETH'] = getBalance(response.data.result, 18)
    }).catch(function (error) {
        console.log(error)
    })

    for (const contract of contracts) {
        await axios.get(apiUrl, {
            params: {
                module: 'account',
                action: 'tokenbalance',
                contractaddress: contract.address,
                address: wallet
            }
        }).then(response => {
            stats[wallet].balances[contract.token] = getBalance(response.data.result, contract.decimals)
        }).catch(function (error) {
            console.log(error)
        })
    }
}

async function getTxs(wallet) {
    const uniqueDays = new Set()
    const uniqueWeeks = new Set()
    const uniqueMonths = new Set()
    const uniqueContracts = new Set()

    let txs = []
    let isAllTxCollected = false

    while (!isAllTxCollected) {
        await axios.get(apiUrl, {
            params: {
                module: 'account',
                action: 'txlist',
                offset: 1000,
                address: wallet
            }
        }).then(response => {
            let items = response.data.result

            if (items.length) {
                isAllTxCollected = true
            }

            Object.values(items).forEach(tx => {
                txs.push(tx)
            })
        }).catch(function (error) {
            console.log(error)
        })
    }

    stats[wallet].txcount = txs.length
    let totalGasUsed = 0

    Object.values(txs).forEach(tx => {
        const date = new Date(tx.timeStamp*1000)
        uniqueDays.add(date.toDateString())
        uniqueWeeks.add(date.getFullYear() + '-' + date.getWeek())
        uniqueMonths.add(date.getFullYear() + '-' + date.getMonth())
        uniqueContracts.add(tx.to)

        totalGasUsed += parseInt(tx.gasPrice) * parseInt(tx.gasUsed) / Math.pow(10, 18)
    })

    const numUniqueDays = uniqueDays.size
    const numUniqueWeeks = uniqueWeeks.size
    const numUniqueMonths = uniqueMonths.size
    const numUniqueContracts = uniqueContracts.size

    if (txs.length) {
        stats[wallet].first_tx_date = new Date(txs[txs.length - 1].timeStamp*1000)
        stats[wallet].last_tx_date = new Date(txs[0].timeStamp*1000)
        stats[wallet].unique_days = numUniqueDays
        stats[wallet].unique_weeks = numUniqueWeeks
        stats[wallet].unique_months = numUniqueMonths
        stats[wallet].unique_contracts = numUniqueContracts
        stats[wallet].total_gas = totalGasUsed
    }
}

let ethPrice = 0
await axios.get('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD').then(response => {
    ethPrice = response.data.USD
})

const wallets = readWallets('./addresses/linea.txt')
let iterations = wallets.length
let iteration = 1
let csvData = []
let total = {
    eth: 0,
    usdc: 0,
    usdt: 0,
    dai: 0,
    gas: 0
}
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
progressBar.start(iterations, 0)

for (let wallet of wallets) {
    stats[wallet] = {
        balances: []
    }

    await getBalances(wallet)
    await getTxs(wallet)
    progressBar.update(iteration)
    await sleep(1.5 * 1000)
    total.gas += stats[wallet].total_gas
    total.eth += parseFloat(stats[wallet].balances['ETH'])
    total.usdt += parseFloat(stats[wallet].balances['USDT'])
    total.usdc += parseFloat(stats[wallet].balances['USDC'])
    total.dai += parseFloat(stats[wallet].balances['DAI'])

    let usdGasValue = (stats[wallet].total_gas*ethPrice).toFixed(2)
    let usdEthValue = (stats[wallet].balances['ETH']*ethPrice).toFixed(2)
    let row
    if (stats[wallet].txcount) {
        row = {
            n: iteration,
            wallet: wallet,
            'ETH': parseFloat(stats[wallet].balances['ETH']).toFixed(4) + ` ($${usdEthValue})`,
            'USDC': parseFloat(stats[wallet].balances['USDC']).toFixed(2),
            'USDT': parseFloat(stats[wallet].balances['USDT']).toFixed(2),
            'DAI': parseFloat(stats[wallet].balances['DAI']).toFixed(2),
            'TX Count': stats[wallet].txcount,
            'Contracts': stats[wallet].unique_contracts,
            'Unique days': stats[wallet].unique_days,
            'Unique weeks': stats[wallet].unique_weeks,
            'Unique months': stats[wallet].unique_months,
            'First tx': moment(stats[wallet].first_tx_date).format("DD.MM.YY"),
            'Last tx': moment(stats[wallet].last_tx_date).format("DD.MM.YY"),
            'Total gas spent': stats[wallet].total_gas.toFixed(4)  + ` ($${usdGasValue})`
        }

        p.addRow(row)
    }

    iteration++

    if (!--iterations) {
        progressBar.stop()
        row = {
            wallet: 'Total',
            'ETH': total.eth.toFixed(4) + ` ($${(total.eth*ethPrice).toFixed(2)})`,
            'USDC': total.usdc.toFixed(2),
            'USDT': total.usdt.toFixed(2),
            'DAI': total.dai.toFixed(2),
            'Total gas spent': total.gas.toFixed(4)  + ` ($${(total.gas*ethPrice).toFixed(2)})`
        }

        p.addRow(row)

        p.printTable()

        p.table.rows.map((row) => {
            csvData.push(row.text)
        })

        csvWriter.writeRecords(csvData)
            .then(() => console.log('Запись в CSV файл завершена'))
            .catch(error => console.error('Произошла ошибка при записи в CSV файл:', error))
    }
}