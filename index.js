const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// ===== CONFIG =====
const PREFIX = "/";
const CURRENCY = "SM";
const BUSINESS_PRICE = 5000;
const INTEREST_RATE = 0.03; // 3% daily
const ADMIN_ID = "1371883463673778357"; // Your Discord ID

// ===== DATABASE =====
let data = { users: {}, business: {} };
if (fs.existsSync("eco.json")) {
  data = JSON.parse(fs.readFileSync("eco.json"));
}

function save() {
  fs.writeFileSync("eco.json", JSON.stringify(data, null, 2));
}

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ===== HELPERS =====
function checkUser(id) {
  if (!data.users[id]) {
    data.users[id] = {
      wallet: 1000,
      bank: 0,
      lastInterest: 0,
      business: null,
      lastWork: 0
    };
  }
}

function giveInterest(id) {
  let u = data.users[id];
  let now = Date.now();
  if (now - u.lastInterest > 86400000) { // 24 hours
    let add = Math.floor(u.bank * INTEREST_RATE);
    u.bank += add;
    u.lastInterest = now;
  }
}

function businessProfit(bid) {
  let b = data.business[bid];
  let now = Date.now();
  if (now - b.lastProfit > 3600000) { // 1 hour
    let base = 300 + Math.floor(Math.random()*300);
    let bonus = Object.keys(b.workers).length * 150;
    b.balance += base + bonus;
    b.lastProfit = now;
  }
}

// ===== MESSAGE HANDLER =====
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  let args = message.content.slice(PREFIX.length).trim().split(/ +/);
  let cmd = args.shift().toLowerCase();

  checkUser(message.author.id);
  giveInterest(message.author.id);

  // ===== ADMIN COMMANDS =====
  if (message.author.id === ADMIN_ID) {
    if (cmd === "addmoney") {
      let user = message.mentions.users.first();
      let amount = parseInt(args[1]);
      if (!user || !amount) return message.reply("Usage: /addmoney @user 500");
      checkUser(user.id);
      data.users[user.id].wallet += amount;
      save();
      return message.reply(`✅ Added ${amount} ${CURRENCY} to ${user.username}`);
    }

    if (cmd === "removemoney") {
      let user = message.mentions.users.first();
      let amount = parseInt(args[1]);
      if (!user || !amount) return message.reply("Usage: /removemoney @user 500");
      checkUser(user.id);
      data.users[user.id].wallet -= amount;
      save();
      return message.reply(`✅ Removed ${amount} ${CURRENCY} from ${user.username}`);
    }
  }

  // ===== BALANCE =====
  if (cmd === "balance") {
    let u = data.users[message.author.id];
    return message.reply(`👛 Wallet: ${u.wallet} ${CURRENCY}\n🏦 Bank: ${u.bank} ${CURRENCY}`);
  }

  // ===== BANK =====
  if (cmd === "deposit") {
    let amt = parseInt(args[0]);
    let u = data.users[message.author.id];
    if (!amt || u.wallet < amt) return message.reply("Invalid amount");
    u.wallet -= amt;
    u.bank += amt;
    save();
    return message.reply(`🏦 Deposited ${amt} ${CURRENCY}`);
  }

  if (cmd === "withdraw") {
    let amt = parseInt(args[0]);
    let u = data.users[message.author.id];
    if (!amt || u.bank < amt) return message.reply("Invalid amount");
    u.bank -= amt;
    u.wallet += amt;
    save();
    return message.reply(`💵 Withdrawn ${amt} ${CURRENCY}`);
  }

  // ===== OPEN BUSINESS =====
  if (cmd === "openbiz") {
    let name = args.join(" ");
    let u = data.users[message.author.id];
    if (u.business) return message.reply("You already own a business");
    if (u.wallet < BUSINESS_PRICE) return message.reply(`Need ${BUSINESS_PRICE} ${CURRENCY} to open a business`);
    u.wallet -= BUSINESS_PRICE;
    let id = "B" + Date.now();
    data.business[id] = {
      name,
      owner: message.author.id,
      balance: 0,
      workers: {},
      lastProfit: Date.now()
    };
    u.business = id;
    save();
    return message.reply(`🏪 Business **${name}** created!`);
  }

  // ===== HIRE STAFF =====
  if (cmd === "hire") {
    let user = message.mentions.users.first();
    let salary = parseInt(args[1]);
    let u = data.users[message.author.id];
    let b = data.business[u.business];
    if (!b) return message.reply("You have no business");
    if (!user || !salary) return message.reply("Usage: /hire @user 300");
    b.workers[user.id] = { salary };
    save();
    return message.reply(`🤝 Hired ${user.username} with salary ${salary} ${CURRENCY}`);
  }

  // ===== WORK =====
  if (cmd === "work") {
    let u = data.users[message.author.id];
    let now = Date.now();
    if (now - u.lastWork < 3600000) return message.reply("⏳ Wait 1 hour before working again");
    let biz = Object.values(data.business).find(b => b.workers[message.author.id]);
    if (!biz) return message.reply("You are not hired anywhere");
    let earn = 200 + Math.floor(Math.random()*200);
    if (biz.balance < earn) return message.reply("Business has low funds");
    biz.balance -= earn;
    u.wallet += earn;
    u.lastWork = now;
    save();
    return message.reply(`🧑‍💼 You worked and earned ${earn} ${CURRENCY}`);
  }

  // ===== COLLECT BUSINESS PROFIT =====
  if (cmd === "bizcollect") {
    let u = data.users[message.author.id];
    let b = data.business[u.business];
    if (!b) return message.reply("You have no business");
    businessProfit(u.business);
    let amt = b.balance;
    b.balance = 0;
    u.wallet += amt;
    save();
    return message.reply(`💼 Collected ${amt} ${CURRENCY} from your business`);
  }

  // ===== TRANSFER BUSINESS =====
  if (cmd === "transfer") {
    let user = message.mentions.users.first();
    let u = data.users[message.author.id];
    let b = data.business[u.business];
    if (!b) return message.reply("You have no business");
    if (!user) return message.reply("Mention a user to transfer ownership");
    checkUser(user.id);
    data.users[user.id].business = u.business;
    u.business = null;
    b.owner = user.id;
    save();
    return message.reply(`📜 Business transferred to ${user.username}`);
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN); // Railway reads TOKEN from environment variable
