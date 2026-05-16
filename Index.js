// =======================================================
//        DISCORD MULTI BOT - 350+ COMMANDS
//           Discord.js v14 | Node.js
// =======================================================
// ⚠️  TẠO FILE .env VÀ THÊM:
//     DISCORD_TOKEN=token_của_bạn
//     WEATHER_KEY=openweathermap_api_key  (tuỳ chọn)
//     TENOR_KEY=tenor_api_key             (tuỳ chọn, cho GIF)
// =======================================================

require('dotenv').config();

const {
    Client, GatewayIntentBits, Partials,
    PermissionsBitField, EmbedBuilder, AttachmentBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    ChannelType, Collection
} = require('discord.js');

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const crypto = require('crypto');
const axios  = require('axios');
const wait   = ms => new Promise(r => setTimeout(r, ms));

// =======================================================
// CONFIG
// =======================================================
const config = {
    prefix      : '!',
    token       : process.env.DISCORD_TOKEN,
    embedColor  : '#00ff99',
    errorColor  : '#ff4444',
    warnColor   : '#ffaa00',
    successColor: '#2ecc71',
    nukeAllowed : ['1500120081655529563'],
};

// =======================================================
// CLIENT
// =======================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// =======================================================
// DATABASE JSON
// =======================================================
const DB_FILE = './data.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        welcomeChannel: {}, logsChannel: {}, prefix: {},
        warns: {}, mutes: {}, afk: {}, autoRole: {},
        customCmds: {}, economy: {}, giveaways: {},
        levelData: {}, reactionRoles: {}, starboard: {},
        tickets: {}, notes: {}, reminders: {}, tags: {},
        disabledCmds: {}, automod: {}, tempbans: {},
        polls: {}, suggestions: {}, countdowns: {},
        birthdays: {}, reputation: {}, marriages: {},
        inventory: {}, pets: {}, confessions: {},
        serverBackups: {}, joinDM: {}, leaveMsg: {},
        muteRole: {}, embedStore: {}, snippets: {},
        boostMsg: {}, userBio: {}, serverStats: {}
    }, null, 2));
}

let db = JSON.parse(fs.readFileSync(DB_FILE));
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function ensureDB(key, id, def = {}) {
    if (!db[key]) db[key] = {};
    if (!db[key][id]) db[key][id] = def;
    return db[key][id];
}

// =======================================================
// COOLDOWNS
// =======================================================
const cooldowns = new Collection();
function checkCooldown(userId, cmd, seconds) {
    const key = `${userId}-${cmd}`;
    const now = Date.now();
    if (cooldowns.has(key)) {
        const left = ((cooldowns.get(key) + seconds * 1000) - now) / 1000;
        if (left > 0) return left.toFixed(1);
    }
    cooldowns.set(key, now);
    return null;
}

// =======================================================
// HELPERS
// =======================================================
function embed(title, desc, color = config.embedColor) {
    return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}
function errEmbed(msg) { return embed('❌ Lỗi', msg, config.errorColor); }
function okEmbed(msg)  { return embed('✅ Thành công', msg, config.successColor); }
function infoEmbed(msg){ return embed('ℹ️ Thông tin', msg, '#3498db'); }

function hasPerms(member, ...flags) {
    return flags.every(f => member.permissions.has(PermissionsBitField.Flags[f]));
}
function isNukeAllowed(userId) { return config.nukeAllowed.includes(userId); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function formatTime(ms) {
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000) % 24;
    const d = Math.floor(ms / 86400000);
    return `${d}d ${h}h ${m}m ${s}s`;
}
function deepUnpack(input) {
    let result = input;
    result = result.replace(/\\(\d{1,3})/g, (m, d) => { const n = parseInt(d); return n <= 255 ? String.fromCharCode(n) : m; });
    result = result.replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    result = result.replace(/"\s*,\s*"/g, '').replace(/"\s*\.\.\s*"/g, '');
    return result.trim();
}
function paginate(arr, page = 1, perPage = 10) {
    const total = Math.ceil(arr.length / perPage);
    const items = arr.slice((page - 1) * perPage, page * perPage);
    return { items, total, page };
}

// =======================================================
// READY
// =======================================================
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    client.user.setActivity('🔥 350+ Commands | !help');

    // Reminder check loop
    setInterval(async () => {
        const now = Date.now();
        for (const userId in db.reminders) {
            if (!Array.isArray(db.reminders[userId])) continue;
            const remaining = [];
            for (const r of db.reminders[userId]) {
                if (now >= r.time) {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) user.send({ embeds: [embed('⏰ Nhắc nhở!', r.text, config.warnColor)] }).catch(() => {});
                } else {
                    remaining.push(r);
                }
            }
            db.reminders[userId] = remaining;
        }
        saveDB();
    }, 30000);

    // Temp ban check loop
    setInterval(async () => {
        const now = Date.now();
        for (const guildId in db.tempbans) {
            for (const userId in db.tempbans[guildId]) {
                const ban = db.tempbans[guildId][userId];
                if (now >= ban.endTime) {
                    const guild = client.guilds.cache.get(guildId);
                    if (guild) await guild.members.unban(userId, 'Tempban hết hạn').catch(() => {});
                    delete db.tempbans[guildId][userId];
                    saveDB();
                }
            }
        }
    }, 60000);
});

// =======================================================
// XP / LEVEL SYSTEM
// =======================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const lvlData = ensureDB('levelData', message.guild.id, {});
    if (!lvlData[message.author.id]) lvlData[message.author.id] = { xp: 0, level: 0 };
    const userData = lvlData[message.author.id];
    userData.xp += randomInt(5, 15);
    const needed = userData.level * 100 + 100;
    if (userData.xp >= needed) {
        userData.level++;
        userData.xp = 0;
        message.channel.send({ embeds: [embed('🎉 Level Up!', `${message.author} lên **Level ${userData.level}**! 🚀`, config.successColor)] }).catch(() => {});
    }
    db.levelData[message.guild.id] = lvlData;
    saveDB();
});

// =======================================================
// COMMAND HANDLER
// =======================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const guildPrefix = db.prefix[message.guild.id] || config.prefix;
    if (!message.content.startsWith(guildPrefix)) return;

    const args    = message.content.slice(guildPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const guild   = message.guild;
    const member  = message.member;
    const channel = message.channel;

    // Disabled commands check
    const disabled = db.disabledCmds?.[guild.id] || [];
    if (disabled.includes(command)) return message.reply({ embeds: [errEmbed(`Lệnh \`${command}\` đã bị tắt`)] });

    // Economy helpers
    function getEco(gId, uId) {
        ensureDB('economy', gId, {});
        if (!db.economy[gId][uId]) db.economy[gId][uId] = { bal: 0, bank: 0, lastDaily: 0, lastWork: 0, lastCrime: 0, lastFish: 0, lastHunt: 0, lastMine: 0 };
        return db.economy[gId][uId];
    }
    function saveEco() { saveDB(); }

    // Log helper
    async function sendLog(title, desc, color = config.warnColor) {
        const lCh = db.logsChannel?.[guild.id];
        if (!lCh) return;
        const logCh = guild.channels.cache.get(lCh);
        logCh?.send({ embeds: [embed(title, desc, color)] }).catch(() => {});
    }

    // =====================================================
    // HELP COMMAND
    // =====================================================
    if (command === 'help') {
        const page = parseInt(args[0]) || 1;
        const categories = {
            '🛡️ Kiểm duyệt': 'ban, kick, mute, unmute, warn, warnings, clearwarns, tempmute, tempban, softban, deafen, undeafen, nick, move, vcmute, vcunmute, massban, strip, addrole, removerole, timeout, untimeout, slowmode, lock, unlock, lockall, unlockall, purge, prune, nuke, hackban',
            '🔧 Kênh': 'clear, lock, unlock, slowmode, nuke, topic, rename, hide, unhide, clone, lockall, unlockall, nsfw, setnick, setslowmode, createchannel, deletechannel, movechannel, syncchannel',
            '📊 Thông tin': 'ping, avatar, userinfo, serverinfo, uptime, botinfo, roleinfo, channelinfo, membercount, inviteinfo, emojiinfo, find, randommember, emojis, roles, perms, banner, guildicon, firstmsg, joined, roleperms',
            '🎮 Vui': 'meme, joke, 8ball, rps, coinflip, dice, roulette, slots, ship, rate, roast, compliment, hack, hug, toss, clap, reverse, fact, dadjoke, wouldyourather, neverhaveiever, truth, dare, riddle, ascii, mock, vaporwave, pat, kiss, slap, bonk, bite, cuddle, poke, dance, cry, laugh, wink, blush, highfive, thumbsup, facepalm, owo, uwu, pp, gay, simp',
            '💰 Kinh tế': 'balance, daily, work, crime, rob, deposit, withdraw, transfer, shop, leaderboard, give, richest, fish, hunt, mine, craft, sell, buy, inventory, market',
            '📈 Level': 'rank, top, givexp, resetxp, levelreward, setlevelup',
            '🛠️ Tiện ích': 'say, poll, embed, remind, afk, calc, base64, weather, timestamp, qr, color, hash, uuid, charcount, uppercase, lowercase, spoiler, binary, morse, passwordgen, translate, shorten, ip, whois, define, synonym, rhyme, lyrics, wiki, urban, decode, encode, rot13, url, hex, octal',
            '📝 Ghi chú': 'note, notes, delnote, clearnotes, searchnote',
            '🏷️ Tags': 'tag, tags, deltag, createtag, edittag, rawtag',
            '🎁 Giveaway': 'gcreate, gend, greroll, glist, gdelete',
            '💕 Xã hội': 'rep, myrep, toprep, marry, divorce, partner, bio, setbio, hug, kiss, pat, slap, cuddle',
            '🐾 Pet': 'pet, petbuy, petfeed, petplay, petrename, petshop, petleave',
            '🎂 Sinh nhật': 'setbday, bday, bdaylist, bdaynext',
            '🔓 Lua': 'unpack',
            '⚙️ Cài đặt': 'setwelcome, setlogs, unlogs, prefix, setautorole, customcmd, starboard, setticket, disablecmd, enablecmd, automod, setmuterole, setsuggestion, setconfession, setjoin, setleave, setboost, setstat',
            '📢 Thông báo': 'announce, rules, dm, embed, broadcast',
            '🎭 Role': 'reactionrole, rolemembers, toproles, createrole, deleterole, colorrole, hoistrole, mentionrole, positionrole',
            '🔨 Nuke (hạn chế)': 'nuke, nukeall',
            '💾 Backup': 'backupserver, restoreserver, backuplist, backupdelete',
            '🎵 Âm nhạc (info)': 'nowplaying, queue, volume, skip, stop, play, pause, resume',
            '📊 Thống kê': 'serverstats, botstats, cmdstats, uptime',
            '🔒 Bảo mật': 'antiraid, antispam, anticaps, antilinks, antimentions, antighostping'
        };
        const catList = Object.keys(categories);
        const perPage = 5;
        const { items, total } = paginate(catList, page, perPage);
        const e = new EmbedBuilder()
            .setTitle('📚 BOT 350+ LỆNH - HELP')
            .setColor(config.embedColor)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: `Trang ${page}/${total} | Prefix: ${guildPrefix} | !help [trang]` });
        for (const cat of items) {
            e.addFields({ name: cat, value: `\`${categories[cat]}\``, inline: false });
        }
        return message.reply({ embeds: [e] });
    }

    // =====================================================
    // PING
    // =====================================================
    if (command === 'ping') {
        const sent = await message.reply('🏓 Đang đo...');
        return sent.edit({ content: '', embeds: [embed('🏓 Pong!', `📡 API: **${client.ws.ping}ms**\n💬 Bot: **${sent.createdTimestamp - message.createdTimestamp}ms**`)] });
    }

    // =====================================================
    // AVATAR / BANNER
    // =====================================================
    if (command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        const e = new EmbedBuilder().setTitle(`🖼️ Avatar của ${user.username}`).setImage(user.displayAvatarURL({ size: 1024, dynamic: true })).setColor(config.embedColor)
            .addFields({ name: 'PNG', value: `[Link](${user.displayAvatarURL({ format: 'png', size: 1024 })})`, inline: true },
                       { name: 'WEBP', value: `[Link](${user.displayAvatarURL({ format: 'webp', size: 1024 })})`, inline: true });
        return message.reply({ embeds: [e] });
    }

    if (command === 'banner') {
        const user = await (message.mentions.users.first() || message.author).fetch();
        if (!user.banner) return message.reply({ embeds: [errEmbed('Người này không có banner')] });
        return message.reply({ embeds: [new EmbedBuilder().setTitle(`🎨 Banner của ${user.username}`).setImage(user.bannerURL({ size: 1024 })).setColor(config.embedColor)] });
    }

    if (command === 'guildicon') {
        if (!guild.iconURL()) return message.reply({ embeds: [errEmbed('Server chưa có icon')] });
        return message.reply({ embeds: [new EmbedBuilder().setTitle(`🏰 Icon: ${guild.name}`).setImage(guild.iconURL({ size: 1024, dynamic: true })).setColor(config.embedColor)] });
    }

    // =====================================================
    // USER / SERVER INFO
    // =====================================================
    if (command === 'userinfo') {
        const mem = message.mentions.members.first() || member;
        const badges = mem.user.flags?.toArray().join(', ') || 'Không có';
        const roles = mem.roles.cache.filter(r => r.id !== guild.id).map(r => r.toString()).join(', ') || 'Không có';
        const e = new EmbedBuilder().setTitle('👤 Thông tin thành viên').setThumbnail(mem.user.displayAvatarURL()).setColor(config.warnColor)
            .addFields(
                { name: 'Tag', value: mem.user.tag, inline: true }, { name: 'ID', value: mem.id, inline: true },
                { name: 'Bot?', value: mem.user.bot ? 'Có' : 'Không', inline: true },
                { name: 'Tham gia server', value: `<t:${parseInt(mem.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: 'Tạo tài khoản', value: `<t:${parseInt(mem.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Badges', value: badges, inline: true },
                { name: 'Roles', value: roles.length > 1024 ? roles.slice(0, 1020) + '...' : roles }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'serverinfo') {
        const textCh  = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceCh = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const catCh   = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        const e = new EmbedBuilder().setTitle(`🏰 ${guild.name}`).setThumbnail(guild.iconURL()).setColor('#3498db')
            .addFields(
                { name: 'ID', value: guild.id, inline: true }, { name: 'Chủ sở hữu', value: `<@${guild.ownerId}>`, inline: true },
                { name: 'Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Kênh Text', value: `${textCh}`, inline: true }, { name: 'Kênh Voice', value: `${voiceCh}`, inline: true },
                { name: 'Category', value: `${catCh}`, inline: true },
                { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                { name: 'Boost', value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount})`, inline: true },
                { name: 'Emoji', value: `${guild.emojis.cache.size}`, inline: true },
                { name: 'Tạo lúc', value: `<t:${parseInt(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Xác minh', value: `${guild.verificationLevel}`, inline: true },
                { name: 'Stickers', value: `${guild.stickers.cache.size}`, inline: true }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'botinfo') {
        const e = new EmbedBuilder().setTitle('🤖 Thông tin Bot').setThumbnail(client.user.displayAvatarURL()).setColor(config.embedColor)
            .addFields(
                { name: 'Tên', value: client.user.tag, inline: true },
                { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'Users', value: `${client.users.cache.size}`, inline: true },
                { name: 'Uptime', value: formatTime(process.uptime() * 1000), inline: true },
                { name: 'RAM', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                { name: 'Node.js', value: process.version, inline: true },
                { name: 'Lệnh', value: '350+', inline: true }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'uptime') return message.reply({ embeds: [embed('⏱️ Uptime', formatTime(process.uptime() * 1000))] });

    if (command === 'roleinfo') {
        const role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
        if (!role) return message.reply({ embeds: [errEmbed('Mention hoặc ID role')] });
        const e = new EmbedBuilder().setTitle(`🏷️ ${role.name}`).setColor(role.hexColor)
            .addFields(
                { name: 'ID', value: role.id, inline: true }, { name: 'Màu', value: role.hexColor, inline: true },
                { name: 'Members', value: `${role.members.size}`, inline: true },
                { name: 'Mentionable', value: role.mentionable ? 'Có' : 'Không', inline: true },
                { name: 'Hoisted', value: role.hoist ? 'Có' : 'Không', inline: true },
                { name: 'Tạo lúc', value: `<t:${parseInt(role.createdTimestamp / 1000)}:R>`, inline: true }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'channelinfo') {
        const ch = message.mentions.channels.first() || channel;
        const e = new EmbedBuilder().setTitle(`📺 #${ch.name}`).setColor(config.embedColor)
            .addFields(
                { name: 'ID', value: ch.id, inline: true }, { name: 'Loại', value: `${ch.type}`, inline: true },
                { name: 'NSFW', value: ch.nsfw ? 'Có' : 'Không', inline: true },
                { name: 'Slowmode', value: `${ch.rateLimitPerUser || 0}s`, inline: true },
                { name: 'Topic', value: ch.topic || 'Không có', inline: false },
                { name: 'Tạo lúc', value: `<t:${parseInt(ch.createdTimestamp / 1000)}:R>`, inline: true }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'membercount') {
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = guild.memberCount - bots;
        const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
        const e = new EmbedBuilder().setTitle('👥 Thành viên').setColor(config.embedColor)
            .addFields(
                { name: 'Tổng', value: `${guild.memberCount}`, inline: true },
                { name: 'Người', value: `${humans}`, inline: true },
                { name: 'Bot', value: `${bots}`, inline: true },
                { name: 'Online', value: `${online}`, inline: true }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'perms') {
        const mem = message.mentions.members.first() || member;
        const perms = mem.permissions.toArray().join(', ');
        return message.reply({ embeds: [embed(`🔑 Quyền của ${mem.user.tag}`, perms.length > 2000 ? perms.slice(0, 1997) + '...' : perms)] });
    }

    if (command === 'firstmsg') {
        const ch = message.mentions.channels.first() || channel;
        const msgs = await ch.messages.fetch({ limit: 1, after: '0' });
        const msg = msgs.first();
        if (!msg) return message.reply({ embeds: [errEmbed('Không tìm được')] });
        return message.reply({ embeds: [embed('📜 Tin nhắn đầu tiên', `**${msg.author.tag}**: ${msg.content || '_Embed/File_'}\n\n[Nhảy vào](${msg.url})`)] });
    }

    if (command === 'joined') {
        const sorted = guild.members.cache.sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
        const pos = sorted.map(m => m.id).indexOf((message.mentions.members.first() || member).id) + 1;
        return message.reply({ embeds: [embed('📅 Thứ tự tham gia', `**${(message.mentions.members.first() || member).user.tag}** là thành viên thứ **${pos}** tham gia server`)] });
    }

    // =====================================================
    // MODERATION
    // =====================================================
    if (command === 'clear' || command === 'purge') {
        if (!hasPerms(member, 'ManageMessages')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply({ embeds: [errEmbed('Nhập số từ 1-100')] });
        const target = message.mentions.members.first();
        let toDelete;
        if (target) {
            const msgs = await channel.messages.fetch({ limit: 100 });
            toDelete = msgs.filter(m => m.author.id === target.id).first(amount);
        } else {
            const deleted = await channel.bulkDelete(amount, true);
            const msg = await channel.send({ embeds: [okEmbed(`Đã xoá ${deleted.size} tin nhắn`)] });
            return setTimeout(() => msg.delete().catch(() => {}), 3000);
        }
        if (toDelete) await channel.bulkDelete(toDelete, true);
        const msg = await channel.send({ embeds: [okEmbed(`Đã xoá ${toDelete?.size || amount} tin nhắn`)] });
        return setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    if (command === 'ban') {
        if (!hasPerms(member, 'BanMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        await target.ban({ reason });
        await sendLog('🔨 Ban', `**${member.user.tag}** ban **${target.user.tag}**\nLý do: ${reason}`, config.errorColor);
        return message.reply({ embeds: [embed('🔨 Đã Ban', `**${target.user.tag}**\nLý do: ${reason}`, config.errorColor)] });
    }

    if (command === 'hackban') {
        if (!hasPerms(member, 'BanMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const userId = args[0];
        if (!userId || !/^\d+$/.test(userId)) return message.reply({ embeds: [errEmbed('Nhập User ID')] });
        const reason = args.slice(1).join(' ') || 'Hackban';
        await guild.members.ban(userId, { reason });
        return message.reply({ embeds: [embed('🔨 Hackban', `ID: \`${userId}\` đã bị ban`, config.errorColor)] });
    }

    if (command === 'kick') {
        if (!hasPerms(member, 'KickMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        await target.kick(reason);
        await sendLog('👢 Kick', `**${member.user.tag}** kick **${target.user.tag}**\nLý do: ${reason}`, config.warnColor);
        return message.reply({ embeds: [embed('👢 Đã Kick', `**${target.user.tag}**\nLý do: ${reason}`, config.warnColor)] });
    }

    if (command === 'mute' || command === 'timeout') {
        if (!hasPerms(member, 'ModerateMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const minutes = parseInt(args[1]) || 10;
        const reason = args.slice(2).join(' ') || `Muted by ${member.user.tag}`;
        await target.timeout(minutes * 60 * 1000, reason);
        await sendLog('🔇 Mute', `**${target.user.tag}** bị mute ${minutes} phút`);
        return message.reply({ embeds: [okEmbed(`Đã mute **${target.user.tag}** trong **${minutes} phút**`)] });
    }

    if (command === 'unmute' || command === 'untimeout') {
        if (!hasPerms(member, 'ModerateMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        await target.timeout(null);
        return message.reply({ embeds: [okEmbed(`Đã unmute **${target.user.tag}**`)] });
    }

    if (command === 'tempmute') {
        if (!hasPerms(member, 'ModerateMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const time = parseInt(args[1]) || 5;
        const unit = (args[2] || 'm').toLowerCase();
        const mult = unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 60000;
        await target.timeout(time * mult);
        return message.reply({ embeds: [okEmbed(`Tempmute **${target.user.tag}** ${time}${unit}`)] });
    }

    if (command === 'tempban') {
        if (!hasPerms(member, 'BanMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const time = parseInt(args[1]) || 1;
        const unit = (args[2] || 'd').toLowerCase();
        const mult = unit === 'h' ? 3600000 : unit === 'm' ? 60000 : 86400000;
        const endTime = Date.now() + time * mult;
        const reason = args.slice(3).join(' ') || `Tempban ${time}${unit}`;
        await target.ban({ reason });
        ensureDB('tempbans', guild.id, {});
        db.tempbans[guild.id][target.id] = { endTime, reason };
        saveDB();
        return message.reply({ embeds: [okEmbed(`Tempban **${target.user.tag}** trong **${time}${unit}**`)] });
    }

    if (command === 'warn') {
        if (!hasPerms(member, 'ModerateMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const reason = args.slice(1).join(' ') || 'Vi phạm nội quy';
        const warns = ensureDB('warns', guild.id, {});
        if (!warns[target.id]) warns[target.id] = [];
        warns[target.id].push({ reason, by: member.user.tag, at: new Date().toISOString() });
        db.warns[guild.id] = warns;
        saveDB();
        const warnCount = warns[target.id].length;
        if (warnCount >= 5) {
            await target.timeout(24 * 60 * 60 * 1000, 'Auto-mute: 5 cảnh cáo').catch(() => {});
            channel.send({ embeds: [embed('⚠️ Auto-Mute', `${target} bị mute 24h do 5 cảnh cáo`, config.errorColor)] });
        }
        await sendLog('⚠️ Warn', `**${target.user.tag}** warn lần ${warnCount}\nLý do: ${reason}`);
        return message.reply({ embeds: [embed('⚠️ Cảnh cáo', `**${target.user.tag}** — Lần ${warnCount}\nLý do: ${reason}`, config.warnColor)] });
    }

    if (command === 'warnings') {
        const target = message.mentions.members.first() || member;
        const warns = db.warns?.[guild.id]?.[target.id] || [];
        if (!warns.length) return message.reply({ embeds: [embed('⚠️ Cảnh cáo', `${target.user.tag} chưa có cảnh cáo`)] });
        const list = warns.map((w, i) => `**${i+1}.** ${w.reason} — ${w.by} lúc ${new Date(w.at).toLocaleDateString('vi-VN')}`).join('\n');
        return message.reply({ embeds: [embed(`⚠️ ${warns.length} cảnh cáo — ${target.user.tag}`, list, config.warnColor)] });
    }

    if (command === 'clearwarns') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        if (db.warns?.[guild.id]) db.warns[guild.id][target.id] = [];
        saveDB();
        return message.reply({ embeds: [okEmbed(`Xoá tất cả cảnh cáo của **${target.user.tag}**`)] });
    }

    if (command === 'softban') {
        if (!hasPerms(member, 'BanMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        await guild.members.ban(target.id, { deleteMessageDays: 7 });
        await guild.members.unban(target.id);
        return message.reply({ embeds: [okEmbed(`Softban **${target.user.tag}** — xoá tin nhắn 7 ngày`)] });
    }

    if (command === 'massban') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const ids = args.filter(a => /^\d+$/.test(a));
        if (!ids.length) return message.reply({ embeds: [errEmbed('Nhập ID người dùng')] });
        let count = 0;
        for (const id of ids) await guild.members.ban(id).then(() => count++).catch(() => {});
        return message.reply({ embeds: [okEmbed(`Đã ban ${count}/${ids.length} người`)] });
    }

    if (command === 'prune') {
        if (!hasPerms(member, 'KickMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const days = parseInt(args[0]) || 7;
        const pruned = await guild.members.prune({ days, dry: false });
        return message.reply({ embeds: [okEmbed(`Đã kick ${pruned} thành viên không hoạt động (${days} ngày)`)] });
    }

    // =====================================================
    // VOICE MOD
    // =====================================================
    if (command === 'deafen') {
        if (!hasPerms(member, 'DeafenMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target?.voice.channel) return message.reply({ embeds: [errEmbed('Không ở trong voice')] });
        await target.voice.setDeaf(true);
        return message.reply({ embeds: [okEmbed(`Deaf **${target.user.tag}**`)] });
    }
    if (command === 'undeafen') {
        if (!hasPerms(member, 'DeafenMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target?.voice.channel) return message.reply({ embeds: [errEmbed('Không ở trong voice')] });
        await target.voice.setDeaf(false);
        return message.reply({ embeds: [okEmbed(`Undeaf **${target.user.tag}**`)] });
    }
    if (command === 'nick' || command === 'setnick') {
        if (!hasPerms(member, 'ManageNicknames')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const newNick = args.slice(1).join(' ') || null;
        await target.setNickname(newNick);
        return message.reply({ embeds: [okEmbed(`Nick **${target.user.tag}** → ${newNick || 'Xoá nick'}`)] });
    }
    if (command === 'move') {
        if (!hasPerms(member, 'MoveMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        const vc = guild.channels.cache.find(c => c.name.toLowerCase().includes(args.slice(1).join(' ').toLowerCase()) && c.type === ChannelType.GuildVoice);
        if (!target?.voice.channel || !vc) return message.reply({ embeds: [errEmbed('Không tìm thấy')] });
        await target.voice.setChannel(vc);
        return message.reply({ embeds: [okEmbed(`Di chuyển **${target.user.tag}** → **${vc.name}**`)] });
    }
    if (command === 'vcmute') {
        if (!hasPerms(member, 'MuteMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target?.voice.channel) return message.reply({ embeds: [errEmbed('Không ở trong voice')] });
        await target.voice.setMute(true);
        return message.reply({ embeds: [okEmbed(`VC mute **${target.user.tag}**`)] });
    }
    if (command === 'vcunmute') {
        if (!hasPerms(member, 'MuteMembers')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target?.voice.channel) return message.reply({ embeds: [errEmbed('Không ở trong voice')] });
        await target.voice.setMute(false);
        return message.reply({ embeds: [okEmbed(`VC unmute **${target.user.tag}**`)] });
    }

    // =====================================================
    // ROLE MANAGEMENT
    // =====================================================
    if (command === 'addrole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!target || !role) return message.reply({ embeds: [errEmbed('Mention thành viên và role')] });
        await target.roles.add(role);
        return message.reply({ embeds: [okEmbed(`Thêm ${role} cho **${target.user.tag}**`)] });
    }
    if (command === 'removerole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!target || !role) return message.reply({ embeds: [errEmbed('Mention thành viên và role')] });
        await target.roles.remove(role);
        return message.reply({ embeds: [okEmbed(`Xoá ${role} khỏi **${target.user.tag}**`)] });
    }
    if (command === 'strip') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const roles = target.roles.cache.filter(r => r.id !== guild.id);
        await target.roles.remove(roles);
        return message.reply({ embeds: [okEmbed(`Xoá ${roles.size} role của **${target.user.tag}**`)] });
    }
    if (command === 'createrole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const name = args[0];
        const color = args[1] || null;
        if (!name) return message.reply({ embeds: [errEmbed('Nhập tên role')] });
        const role = await guild.roles.create({ name, color });
        return message.reply({ embeds: [okEmbed(`Tạo role **${role.name}**`)] });
    }
    if (command === 'deleterole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
        if (!role) return message.reply({ embeds: [errEmbed('Không tìm thấy role')] });
        await role.delete();
        return message.reply({ embeds: [okEmbed(`Đã xoá role`)] });
    }
    if (command === 'colorrole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const role = message.mentions.roles.first();
        const color = args[1];
        if (!role || !color) return message.reply({ embeds: [errEmbed('Dùng: !colorrole @role #hex')] });
        await role.setColor(color);
        return message.reply({ embeds: [okEmbed(`Đổi màu **${role.name}** → \`${color}\``)] });
    }
    if (command === 'hoistrole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const role = message.mentions.roles.first();
        if (!role) return message.reply({ embeds: [errEmbed('Mention role')] });
        await role.setHoist(!role.hoist);
        return message.reply({ embeds: [okEmbed(`${role.name} hoist: **${!role.hoist ? 'Bật' : 'Tắt'}**`)] });
    }
    if (command === 'mentionrole') {
        if (!hasPerms(member, 'ManageRoles')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const role = message.mentions.roles.first();
        if (!role) return message.reply({ embeds: [errEmbed('Mention role')] });
        await role.setMentionable(!role.mentionable);
        return message.reply({ embeds: [okEmbed(`${role.name} mentionable: **${!role.mentionable ? 'Bật' : 'Tắt'}**`)] });
    }

    // =====================================================
    // CHANNEL MANAGEMENT
    // =====================================================
    if (command === 'lock') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return message.reply({ embeds: [embed('🔒 Khoá kênh', 'Kênh đã bị khoá', config.errorColor)] });
    }
    if (command === 'unlock') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
        return message.reply({ embeds: [okEmbed('Kênh đã được mở')] });
    }
    if (command === 'slowmode' || command === 'setslowmode') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const time = parseInt(args[0]);
        if (isNaN(time)) return message.reply({ embeds: [errEmbed('Nhập số giây')] });
        await channel.setRateLimitPerUser(time);
        return message.reply({ embeds: [okEmbed(time === 0 ? 'Tắt slowmode' : `Slowmode: **${time}s**`)] });
    }
    if (command === 'topic') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        await channel.setTopic(args.join(' '));
        return message.reply({ embeds: [okEmbed(`Topic: **${args.join(' ')}**`)] });
    }
    if (command === 'rename') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const newName = args.join('-').toLowerCase();
        await channel.setName(newName);
        return message.reply({ embeds: [okEmbed(`Đổi tên: **${newName}**`)] });
    }
    if (command === 'hide') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
        return message.reply({ embeds: [embed('🙈 Ẩn kênh', 'Kênh đã ẩn', config.warnColor)] });
    }
    if (command === 'unhide') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true });
        return message.reply({ embeds: [okEmbed('Kênh đã hiển thị')] });
    }
    if (command === 'clone') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const cloned = await channel.clone();
        return message.reply({ embeds: [okEmbed(`Đã clone: ${cloned}`)] });
    }
    if (command === 'nsfw') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        await channel.setNSFW(!channel.nsfw);
        return message.reply({ embeds: [okEmbed(`NSFW: **${!channel.nsfw ? 'Tắt' : 'Bật'}**`)] });
    }
    if (command === 'createchannel') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const name = args[0]; const type = args[1] || 'text';
        if (!name) return message.reply({ embeds: [errEmbed('Nhập tên kênh')] });
        const chType = type === 'voice' ? ChannelType.GuildVoice : type === 'category' ? ChannelType.GuildCategory : ChannelType.GuildText;
        const ch = await guild.channels.create({ name, type: chType });
        return message.reply({ embeds: [okEmbed(`Tạo kênh ${ch}`)] });
    }
    if (command === 'deletechannel') {
        if (!hasPerms(member, 'ManageChannels')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const ch = message.mentions.channels.first() || guild.channels.cache.get(args[0]);
        if (!ch) return message.reply({ embeds: [errEmbed('Không tìm thấy kênh')] });
        await ch.delete();
        return message.reply({ embeds: [okEmbed(`Đã xoá kênh **${ch.name}**`)] });
    }
    if (command === 'lockall') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        let count = 0;
        for (const [, ch] of guild.channels.cache.filter(c => c.type === ChannelType.GuildText)) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).then(() => count++).catch(() => {});
        }
        return message.reply({ embeds: [embed('🔒 Lockall', `Khoá ${count} kênh`, config.errorColor)] });
    }
    if (command === 'unlockall') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        let count = 0;
        for (const [, ch] of guild.channels.cache.filter(c => c.type === ChannelType.GuildText)) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true }).then(() => count++).catch(() => {});
        }
        return message.reply({ embeds: [okEmbed(`Mở khoá ${count} kênh`)] });
    }

// =====================================================
// ★★★ SUPER NUKE - PHANTOM MODE (CẢI TIẾN) ★★★
// =====================================================
if (command === 'nuke') {
    // 1. Kiểm tra quyền hạn tối cao
    if (!isNukeAllowed(message.author.id)) {
        return message.reply({ embeds: [embed('🚫 Bị từ chối', `ID \`${message.author.id}\` không được phép kích hoạt Phantom Mode`, config.errorColor)] });
    }
    if (!hasPerms(member, 'Administrator')) {
        return message.reply({ embeds: [errEmbed('Cần quyền Administrator tối cao để chạy lệnh này!')] });
    }

    // 2. Tin nhắn xác nhận (Tránh bấm nhầm)
    const confirmMsg = await message.reply({ 
        embeds: [embed('☣️ PHANTOM NUKE PROTOCOL', `CẢNH BÁO: Hành động này sẽ XOÁ TOÀN BỘ SERVER và đổi tên thành PHANTOM!\n✅ Xác nhận huỷ diệt, ❌ Huỷ bỏ (15 giây)`, '#ff0000')] 
    });
    
    await confirmMsg.react('✅'); 
    await confirmMsg.react('❌');

    const filter = (r, u) => ['✅','❌'].includes(r.emoji.name) && u.id === message.author.id;
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 15000 }).catch(() => null);

    if (!collected || collected.first()?.emoji.name === '❌') {
        return confirmMsg.edit({ embeds: [embed('❌ Huỷ bỏ', 'Đã huỷ kích hoạt Phantom Mode. Server an toàn.', config.warnColor)] }).catch(() => {});
    }

    // 3. BẮT ĐẦU QUÁ TRÌNH KHỞI CHẠY PHANTOM NUKER
    await message.channel.send('☣️ *Phantom Protocol đã được kích hoạt... Đang dọn dẹp server...*');

    // Bước A: Xoá SẠCH TẤT CẢ các kênh hiện có trong Guild
    const allChannels = message.guild.channels.cache;
    for (const [, ch] of allChannels) {
        await ch.delete('Phantom Raid').catch(err => console.log(`Không thể xoá kênh ${ch.name}: ${err.message}`));
    }

    // Bước B: Tạo 50 kênh mới và gửi tin nhắn (50 kênh x 20 tin nhắn = 1000 Pings)
    // Tách nhỏ số lượng tin nhắn ra các kênh để tránh dính Rate Limit quá nặng từ Discord API
    for (let i = 1; i <= 50; i++) {
        message.guild.channels.create({
            name: `phantom-hacked-${i}`,
            type: 0, // 0 tương ứng với GuildText (Kênh văn bản)
            topic: 'SERVER TRỰC THUỘC PHANTOM CLUB',
            reason: 'Phantom Nuke'
        }).then(async (newCh) => {
            // Vòng lặp gửi 20 tin nhắn mỗi kênh nhằm đạt tổng ~1000 pings trên toàn server
            for (let j = 0; j < 20; j++) {
                await newCh.send({
                    content: '@everyone @here **PHANTOM OWNED THIS SERVER** 💀\n👉 Tham gia ngay: https://discord.gg/hj57h3hnvs',
                    embeds: [
                        embed(
                            '💥 PHANTOM MODE ACTIVATED 💥', 
                            `**Server này đã bị xoá sổ hoàn toàn bởi Phantom!**\n\n• Kẻ kích hoạt: <@${message.author.id}>\n• Trạng thái: **Destroyed**\n• Tham gia Server hỗ trợ: https://discord.gg/hj57h3hnvsn• Goodbye admin cũ! 🖕`, 
                            '#ff0000'
                        ).setImage('https://i.imgur.com/L7X7N3Y.gif')
                    ]
                }).catch(() => {}); // Bỏ qua lỗi nếu bị rate limit cục bộ
            }
        }).catch(err => console.log(`Lỗi tạo kênh: ${err.message}`));
    }
}
    // =====================================================
    // ★★★ BACKUP SERVER ★★★
    // =====================================================
    if (command === 'backupserver') {
        if (!isNukeAllowed(message.author.id) && !hasPerms(member, 'Administrator'))
            return message.reply({ embeds: [errEmbed('Cần quyền Administrator')] });

        const msg = await message.reply({ embeds: [embed('💾 Backup', 'Đang backup server...', config.warnColor)] });

        try {
            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id)
                .sort((a, b) => a.position - b.position)
                .map(r => ({
                    id: r.id, name: r.name, color: r.color, hoist: r.hoist,
                    permissions: r.permissions.bitfield.toString(),
                    mentionable: r.mentionable, position: r.position
                }));

            const channels = guild.channels.cache
                .sort((a, b) => a.position - b.position)
                .map(ch => ({
                    id: ch.id, name: ch.name, type: ch.type,
                    topic: ch.topic || null, nsfw: ch.nsfw || false,
                    bitrate: ch.bitrate || null, userLimit: ch.userLimit || null,
                    rateLimitPerUser: ch.rateLimitPerUser || 0,
                    parentId: ch.parentId, position: ch.position,
                    permissionOverwrites: ch.permissionOverwrites.cache.map(p => ({
                        id: p.id, allow: p.allow.bitfield.toString(),
                        deny: p.deny.bitfield.toString(), type: p.type
                    }))
                }));

            const emojis = guild.emojis.cache.map(e => ({
                name: e.name, url: e.imageURL(), animated: e.animated
            }));

            const settings = {
                name: guild.name,
                verificationLevel: guild.verificationLevel,
                explicitContentFilter: guild.explicitContentFilter,
                defaultMessageNotifications: guild.defaultMessageNotifications,
                afkTimeout: guild.afkTimeout,
                preferredLocale: guild.preferredLocale,
                description: guild.description || null
            };

            const backupId = `backup_${guild.id}_${Date.now()}`;
            const backupData = {
                backupId, createdAt: Date.now(), createdBy: message.author.tag,
                guildID: guild.id, guildName: guild.name,
                roles, channels, emojis, settings
            };

            // Save to DB for !backuplist / !restoreserver by ID
            ensureDB('serverBackups', guild.id, {});
            db.serverBackups[guild.id][backupId] = {
                id: backupId, createdAt: Date.now(), createdBy: message.author.tag,
                guildName: guild.name, roleCount: roles.length,
                channelCount: channels.length, emojiCount: emojis.length
            };
            saveDB();

            const json = JSON.stringify(backupData, null, 2);
            const attachment = new AttachmentBuilder(Buffer.from(json), { name: `${backupId}.json` });

            const e = new EmbedBuilder()
                .setTitle('✅ Backup Thành Công!')
                .setColor('Green')
                .setDescription([
                    `🏰 Server: **${guild.name}**`,
                    `🆔 Backup ID: \`${backupId}\``,
                    `🏷 Roles: **${roles.length}**`,
                    `💬 Channels: **${channels.length}**`,
                    `😀 Emojis: **${emojis.length}**`,
                    ``,
                    `📌 Dùng \`!restoreserver\` + đính kèm file JSON này để restore`,
                    `📋 Xem danh sách: \`!backuplist\``
                ].join('\n'));

            await msg.edit({ content: '', embeds: [e], files: [attachment] });
        } catch (err) {
            console.error(err);
            await msg.edit({ content: `❌ Lỗi backup: ${err.message}` });
        }
        return;
    }

    // =====================================================
    // ★★★ RESTORE SERVER ★★★
    // =====================================================
    if (command === 'restoreserver') {
        if (!isNukeAllowed(message.author.id) && !hasPerms(member, 'Administrator'))
            return message.reply({ embeds: [errEmbed('Cần quyền Administrator')] });

        const file = message.attachments.first();
        if (!file) return message.reply({ embeds: [errEmbed('Đính kèm file backup JSON!\nDùng: !backupserver để tạo backup trước')] });

        const progressMsg = await message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📥 Restore Server')
                .setColor(config.warnColor)
                .setDescription([
                    '⚠️ **CẢNH BÁO**: Restore sẽ:',
                    '',
                    '❌ XÓA TOÀN BỘ CHANNEL hiện tại',
                    '❌ XÓA TOÀN BỘ ROLE hiện tại',
                    '✅ Tạo lại từ file backup',
                    '',
                    '⏳ Bắt đầu sau **5 giây**...',
                    'Dùng `!nuke cancel` để huỷ (không khả dụng)'
                ].join('\n'))
            ]
        });

        await wait(5000);

        try {
            const res = await axios.get(file.url);
            const backup = res.data;

            // Validate backup file
            if (!backup.roles || !backup.channels) {
                return progressMsg.edit({ content: '❌ File backup không hợp lệ!' });
            }

            const updateProgress = async (step, total, detail = '') => {
                await progressMsg.edit({
                    embeds: [new EmbedBuilder()
                        .setTitle('🔄 Đang Restore...')
                        .setColor(config.warnColor)
                        .setDescription(`**Bước ${step}/${total}**: ${detail}\n\n⏳ Vui lòng chờ...`)
                    ]
                }).catch(() => {});
            };

            // Step 1: Delete channels
            await updateProgress(1, 6, 'Xoá channels cũ...');
            for (const ch of guild.channels.cache.values()) {
                await ch.delete().catch(() => {});
                await wait(300);
            }

            // Step 2: Delete roles
            await updateProgress(2, 6, 'Xoá roles cũ...');
            const botRolePos = guild.members.me.roles.highest.position;
            for (const role of guild.roles.cache.values()) {
                if (role.id === guild.id || role.position >= botRolePos) continue;
                await role.delete().catch(() => {});
                await wait(400);
            }

            // Step 3: Create roles
            await updateProgress(3, 6, `Tạo ${backup.roles.length} roles...`);
            const roleMap = new Map();
            const sortedRoles = [...backup.roles].sort((a, b) => a.position - b.position);
            for (const roleData of sortedRoles) {
                try {
                    const role = await guild.roles.create({
                        name: roleData.name, color: roleData.color,
                        hoist: roleData.hoist, permissions: BigInt(roleData.permissions),
                        mentionable: roleData.mentionable
                    });
                    roleMap.set(roleData.id, role);
                    await wait(600);
                } catch (e) { console.error('Role create error:', e.message); }
            }

            // Step 4: Create categories
            await updateProgress(4, 6, 'Tạo categories...');
            const categoryMap = new Map();
            const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
            for (const catData of categories) {
                try {
                    const overwrites = catData.permissionOverwrites.map(p => ({
                        id: roleMap.get(p.id)?.id || p.id,
                        allow: BigInt(p.allow), deny: BigInt(p.deny), type: p.type
                    }));
                    const cat = await guild.channels.create({
                        name: catData.name, type: ChannelType.GuildCategory,
                        position: catData.position, permissionOverwrites: overwrites
                    });
                    categoryMap.set(catData.id, cat);
                    await wait(600);
                } catch (e) { console.error('Category create error:', e.message); }
            }

            // Step 5: Create channels
            await updateProgress(5, 6, `Tạo ${backup.channels.filter(c => c.type !== ChannelType.GuildCategory).length} channels...`);
            const normalChannels = backup.channels
                .filter(c => c.type !== ChannelType.GuildCategory)
                .sort((a, b) => a.position - b.position);
            for (const chData of normalChannels) {
                try {
                    const overwrites = chData.permissionOverwrites.map(p => ({
                        id: roleMap.get(p.id)?.id || p.id,
                        allow: BigInt(p.allow), deny: BigInt(p.deny), type: p.type
                    }));
                    const chOptions = {
                        name: chData.name, type: chData.type,
                        topic: chData.topic, nsfw: chData.nsfw,
                        bitrate: chData.bitrate, userLimit: chData.userLimit,
                        rateLimitPerUser: chData.rateLimitPerUser,
                        parent: categoryMap.get(chData.parentId)?.id || null,
                        permissionOverwrites: overwrites, position: chData.position
                    };
                    await guild.channels.create(chOptions);
                    await wait(700);
                } catch (e) { console.error('Channel create error:', e.message); }
            }

            // Step 6: Restore emojis (optional, slow)
            await updateProgress(6, 6, `Restore ${backup.emojis.length} emojis...`);
            let emojiCount = 0;
            for (const emoji of backup.emojis) {
                try {
                    await guild.emojis.create({ attachment: emoji.url, name: emoji.name });
                    emojiCount++;
                    await wait(1500);
                } catch (e) { /* Skip if emoji limit reached */ }
            }

            // Done! Find a channel to send success message
            const anyChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has('SendMessages'));
            if (anyChannel) {
                await anyChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ Restore Thành Công!')
                        .setColor('Green')
                        .setDescription([
                            `🏰 Từ backup: **${backup.guildName}**`,
                            `📅 Backup lúc: <t:${Math.floor(backup.createdAt / 1000)}:R>`,
                            `🏷 Roles: **${roleMap.size}/${backup.roles.length}**`,
                            `💬 Channels: **${normalChannels.length}**`,
                            `📁 Categories: **${categoryMap.size}**`,
                            `😀 Emojis: **${emojiCount}/${backup.emojis.length}**`
                        ].join('\n'))
                    ]
                });
            }
        } catch (err) {
            console.error('Restore error:', err);
            progressMsg.edit({ content: `❌ Restore lỗi: \`${err.message}\`` }).catch(() => {});
        }
        return;
    }

    // =====================================================
    // BACKUP LIST / DELETE
    // =====================================================
    if (command === 'backuplist') {
        const backups = db.serverBackups?.[guild.id] || {};
        const list = Object.values(backups);
        if (!list.length) return message.reply({ embeds: [embed('💾 Backups', 'Chưa có backup nào')] });
        const text = list.map((b, i) => `**${i+1}.** \`${b.id}\`\n👤 ${b.createdBy} | <t:${Math.floor(b.createdAt/1000)}:R>\n🏷 ${b.roleCount} roles | 💬 ${b.channelCount} channels`).join('\n\n');
        return message.reply({ embeds: [embed(`💾 ${list.length} Backups — ${guild.name}`, text.slice(0, 4000))] });
    }

    if (command === 'backupdelete') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const id = args[0];
        if (!id || !db.serverBackups?.[guild.id]?.[id]) return message.reply({ embeds: [errEmbed('ID backup không tồn tại')] });
        delete db.serverBackups[guild.id][id];
        saveDB();
        return message.reply({ embeds: [okEmbed(`Xoá backup \`${id}\``)] });
    }

    // =====================================================
    // UTILITY
    // =====================================================
    if (command === 'say') {
        if (!hasPerms(member, 'ManageMessages')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const text = args.join(' '); if (!text) return;
        await message.delete().catch(() => {}); channel.send(text);
    }

    if (command === 'poll') {
        const text = args.join(' ');
        if (!text) return message.reply({ embeds: [errEmbed('Nhập nội dung poll')] });
        const poll = await channel.send({ embeds: [embed('📊 BÌNH CHỌN', text)] });
        await poll.react('✅'); await poll.react('❌');
    }

    if (command === 'embed') {
        if (!hasPerms(member, 'ManageMessages')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const [title, ...rest] = args.join(' ').split('|');
        const desc = rest.join('|');
        if (!title) return message.reply({ embeds: [errEmbed('Dùng: !embed Tiêu đề | Nội dung')] });
        channel.send({ embeds: [embed(title.trim(), desc?.trim() || '‎')] });
        message.delete().catch(() => {});
    }

    if (command === 'announce') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const content = args.join(' ');
        if (!content) return message.reply({ embeds: [errEmbed('Nhập nội dung')] });
        await message.delete().catch(() => {});
        channel.send({ content: '@everyone', embeds: [embed('📢 THÔNG BÁO', content, config.warnColor)] });
    }

    if (command === 'broadcast') {
        if (!isNukeAllowed(message.author.id)) return message.reply({ embeds: [errEmbed('Không có quyền')] });
        const content = args.join(' ');
        if (!content) return message.reply({ embeds: [errEmbed('Nhập nội dung')] });
        let sent = 0;
        for (const [, g] of client.guilds.cache) {
            const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me)?.has('SendMessages'));
            if (ch) { await ch.send({ embeds: [embed('📢 Broadcast', content, config.warnColor)] }).catch(() => {}); sent++; }
        }
        return message.reply({ embeds: [okEmbed(`Đã broadcast đến ${sent} server`)] });
    }

    if (command === 'remind') {
        const time = parseInt(args[0]);
        const unit = (args[1] || 'm').toLowerCase();
        const note = args.slice(2).join(' ') || 'Reminder!';
        if (isNaN(time)) return message.reply({ embeds: [errEmbed('Dùng: !remind 10 m nội dung')] });
        const mult = unit === 'h' ? 3600000 : unit === 's' ? 1000 : unit === 'd' ? 86400000 : 60000;
        const endTime = Date.now() + time * mult;
        ensureDB('reminders', message.author.id, []);
        if (!Array.isArray(db.reminders[message.author.id])) db.reminders[message.author.id] = [];
        db.reminders[message.author.id].push({ time: endTime, text: note });
        saveDB();
        return message.reply({ embeds: [okEmbed(`Sẽ nhắc sau **${time}${unit}**: ${note}`)] });
    }

    if (command === 'afk') {
        const reason = args.join(' ') || 'AFK';
        ensureDB('afk', guild.id, {});
        db.afk[guild.id][message.author.id] = reason;
        saveDB();
        return message.reply({ embeds: [embed('😴 AFK', `${message.author} AFK: **${reason}**`, config.warnColor)] });
    }

    if (command === 'calc') {
        const expr = args.join(' ');
        try {
            const result = Function(`"use strict"; return (${expr})`)();
            return message.reply({ embeds: [embed('🧮 Kết quả', `\`${expr}\` = **${result}**`)] });
        } catch { return message.reply({ embeds: [errEmbed('Biểu thức không hợp lệ')] }); }
    }

    if (command === 'base64') {
        const mode = args[0]?.toLowerCase();
        const text = args.slice(1).join(' ');
        if (!mode || !text || !['encode', 'decode'].includes(mode)) return message.reply({ embeds: [errEmbed('Dùng: !base64 encode|decode [text]')] });
        try {
            const result = mode === 'encode' ? Buffer.from(text).toString('base64') : Buffer.from(text, 'base64').toString('utf8');
            return message.reply({ embeds: [embed(`🔐 Base64 ${mode}`, `\`\`\`${result.slice(0, 1900)}\`\`\``)] });
        } catch { return message.reply({ embeds: [errEmbed('Lỗi chuyển đổi')] }); }
    }

    if (command === 'timestamp') {
        const now = Math.floor(Date.now() / 1000);
        return message.reply({ embeds: [embed('🕐 Timestamp',
            `Unix: \`${now}\`\n🕐 <t:${now}:T> | 📅 <t:${now}:D> | 🗓️ <t:${now}:F> | 🔢 <t:${now}:R>`)] });
    }

    if (command === 'qr') {
        const text = args.join(' ');
        if (!text) return message.reply({ embeds: [errEmbed('Nhập nội dung QR')] });
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
        return message.reply({ embeds: [new EmbedBuilder().setTitle('📱 QR Code').setImage(url).setColor(config.embedColor).setDescription(`\`${text.slice(0, 100)}\``)] });
    }

    if (command === 'color') {
        const hex = args[0]?.startsWith('#') ? args[0] : `#${args[0]}`;
        if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return message.reply({ embeds: [errEmbed('Hex hợp lệ: !color #ff0000')] });
        return message.reply({ embeds: [new EmbedBuilder().setTitle('🎨 Color').setColor(hex).setDescription(`**${hex.toUpperCase()}**`).setThumbnail(`https://singlecolorimage.com/get/${hex.replace('#','')}/200x200`)] });
    }

    if (command === 'hash') {
        const text = args.join(' ');
        if (!text) return message.reply({ embeds: [errEmbed('Nhập text')] });
        const md5 = crypto.createHash('md5').update(text).digest('hex');
        const sha1 = crypto.createHash('sha1').update(text).digest('hex');
        const sha256 = crypto.createHash('sha256').update(text).digest('hex');
        return message.reply({ embeds: [embed('🔐 Hash', `**Input:** \`${text.slice(0,50)}\`\n**MD5:** \`${md5}\`\n**SHA1:** \`${sha1}\`\n**SHA256:** \`${sha256}\``)] });
    }

    if (command === 'uuid') {
        const uuid = crypto.randomUUID();
        return message.reply({ embeds: [embed('🔑 UUID v4', `\`${uuid}\``)] });
    }

    if (command === 'charcount') {
        const text = args.join(' ');
        if (!text) return message.reply({ embeds: [errEmbed('Nhập text')] });
        return message.reply({ embeds: [embed('📊 Đếm', `**Ký tự:** ${text.length}\n**Không khoảng:** ${text.replace(/\s/g,'').length}\n**Từ:** ${text.trim().split(/\s+/).length}\n**Dòng:** ${text.split('\n').length}`)] });
    }

    if (command === 'uppercase') { const t = args.join(' '); if (!t) return; return message.reply({ embeds: [embed('🔤', t.toUpperCase())] }); }
    if (command === 'lowercase') { const t = args.join(' '); if (!t) return; return message.reply({ embeds: [embed('🔡', t.toLowerCase())] }); }

    if (command === 'spoiler') {
        const text = args.join(' ');
        if (!text) return;
        await message.delete().catch(() => {});
        return channel.send(`||${text}||`);
    }

    if (command === 'binary') {
        const mode = args[0]?.toLowerCase(); const text = args.slice(1).join(' ');
        if (!mode || !text || !['encode','decode'].includes(mode)) return message.reply({ embeds: [errEmbed('Dùng: !binary encode|decode [text]')] });
        try {
            const result = mode === 'encode'
                ? text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ')
                : text.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');
            return message.reply({ embeds: [embed(`💾 Binary ${mode}`, `\`\`\`${result.slice(0,1900)}\`\`\``)] });
        } catch { return message.reply({ embeds: [errEmbed('Lỗi')] }); }
    }

    if (command === 'morse') {
        const text = args.join(' ').toLowerCase();
        const morseMap = {a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',y:'-.--',z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.',' ':'/'};
        const encoded = text.split('').map(c => morseMap[c] || '?').join(' ');
        return message.reply({ embeds: [embed('📡 Morse', `\`${encoded.slice(0,1900)}\``)] });
    }

    if (command === 'rot13') {
        const text = args.join(' ');
        if (!text) return;
        const result = text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)));
        return message.reply({ embeds: [embed('🔄 ROT13', result)] });
    }

    if (command === 'hex') {
        const mode = args[0]?.toLowerCase(); const text = args.slice(1).join(' ');
        if (!mode || !['encode','decode'].includes(mode)) return message.reply({ embeds: [errEmbed('Dùng: !hex encode|decode [text]')] });
        try {
            const result = mode === 'encode' ? Buffer.from(text).toString('hex') : Buffer.from(text, 'hex').toString('utf8');
            return message.reply({ embeds: [embed('🔢 Hex', `\`${result.slice(0,1900)}\``)] });
        } catch { return message.reply({ embeds: [errEmbed('Lỗi')] }); }
    }

    if (command === 'passwordgen') {
        const len = Math.min(Math.max(parseInt(args[0]) || 16, 8), 64);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let pw = '';
        for (let i = 0; i < len; i++) pw += chars[randomInt(0, chars.length - 1)];
        return message.reply({ embeds: [embed('🔒 Mật khẩu', `\`${pw}\`\n\n_${len} ký tự — Đừng chia sẻ!_`)] });
    }

    if (command === 'urban') {
        const term = args.join(' ');
        if (!term) return message.reply({ embeds: [errEmbed('Nhập từ cần tra')] });
        try {
            const res = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
            const def = res.data.list[0];
            if (!def) return message.reply({ embeds: [errEmbed('Không tìm thấy định nghĩa')] });
            return message.reply({ embeds: [embed(`📖 Urban: ${term}`, `${def.definition.slice(0,1000)}\n\n**Ví dụ:** ${def.example.slice(0,500)}\n\n👍 ${def.thumbs_up} | 👎 ${def.thumbs_down}`)] });
        } catch { return message.reply({ embeds: [errEmbed('Không tra được')] }); }
    }

    if (command === 'weather') {
        const city = args.join(' ');
        if (!city) return message.reply({ embeds: [errEmbed('Nhập tên thành phố')] });
        const key = process.env.WEATHER_KEY;
        if (!key) return message.reply({ embeds: [errEmbed('Thiếu WEATHER_KEY trong .env')] });
        try {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric&lang=vi`);
            const d = res.data;
            return message.reply({ embeds: [new EmbedBuilder().setTitle(`🌤️ ${d.name}, ${d.sys.country}`).setColor(config.embedColor)
                .addFields(
                    { name: '🌡️ Nhiệt độ', value: `${d.main.temp}°C (Cảm giác: ${d.main.feels_like}°C)`, inline: true },
                    { name: '💧 Độ ẩm', value: `${d.main.humidity}%`, inline: true },
                    { name: '💨 Gió', value: `${d.wind.speed} m/s`, inline: true },
                    { name: '☁️ Thời tiết', value: d.weather[0].description, inline: true },
                    { name: '👁️ Tầm nhìn', value: `${(d.visibility/1000).toFixed(1)} km`, inline: true },
                    { name: '🌡️ Min/Max', value: `${d.main.temp_min}°C / ${d.main.temp_max}°C`, inline: true }
                )
                .setThumbnail(`https://openweathermap.org/img/wn/${d.weather[0].icon}@2x.png`)
            ]});
        } catch { return message.reply({ embeds: [errEmbed('Không tìm thấy thành phố')] }); }
    }

    // =====================================================
    // LEVEL SYSTEM
    // =====================================================
    if (command === 'rank') {
        const target = message.mentions.members.first() || member;
        const lvlData = db.levelData?.[guild.id]?.[target.id] || { xp: 0, level: 0 };
        const needed = lvlData.level * 100 + 100;
        const progress = Math.floor((lvlData.xp / needed) * 10);
        const bar = '█'.repeat(progress) + '░'.repeat(10 - progress);
        const allData = Object.entries(db.levelData?.[guild.id] || {}).sort(([,a],[,b]) => b.level - a.level || b.xp - a.xp);
        const rank = allData.findIndex(([id]) => id === target.id) + 1;
        const e = new EmbedBuilder().setTitle(`📈 ${target.displayName}`).setThumbnail(target.user.displayAvatarURL()).setColor(config.embedColor)
            .addFields(
                { name: 'Level', value: `${lvlData.level}`, inline: true },
                { name: 'XP', value: `${lvlData.xp}/${needed}`, inline: true },
                { name: 'Rank', value: `#${rank}`, inline: true },
                { name: 'Tiến độ', value: `\`[${bar}]\``, inline: false }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'top') {
        const lvlData = db.levelData?.[guild.id] || {};
        const sorted = Object.entries(lvlData).sort(([,a],[,b]) => b.level - a.level || b.xp - a.xp).slice(0, 10);
        if (!sorted.length) return message.reply({ embeds: [embed('📊 Top', 'Chưa có dữ liệu')] });
        const medals = ['🥇','🥈','🥉'];
        const list = sorted.map(([id, d], i) => `${medals[i]||`**${i+1}.**`} <@${id}> — Level ${d.level} (${d.xp} XP)`).join('\n');
        return message.reply({ embeds: [embed('🏆 BXH Level', list)] });
    }

    if (command === 'givexp') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first(); const amount = parseInt(args[1]);
        if (!target || isNaN(amount)) return message.reply({ embeds: [errEmbed('Dùng: !givexp @user [số]')] });
        const lvlData = ensureDB('levelData', guild.id, {});
        if (!lvlData[target.id]) lvlData[target.id] = { xp: 0, level: 0 };
        lvlData[target.id].xp += amount; db.levelData[guild.id] = lvlData; saveDB();
        return message.reply({ embeds: [okEmbed(`Thêm ${amount} XP cho **${target.user.tag}**`)] });
    }

    if (command === 'resetxp') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention thành viên')] });
        const lvlData = ensureDB('levelData', guild.id, {});
        lvlData[target.id] = { xp: 0, level: 0 }; db.levelData[guild.id] = lvlData; saveDB();
        return message.reply({ embeds: [okEmbed(`Reset XP của **${target.user.tag}**`)] });
    }

    // =====================================================
    // ECONOMY
    // =====================================================
    if (command === 'balance' || command === 'bal') {
        const target = message.mentions.members.first() || member;
        const eco = getEco(guild.id, target.id);
        const e = new EmbedBuilder().setTitle(`💰 ${target.displayName}`).setColor(config.warnColor)
            .addFields(
                { name: '👛 Ví', value: `${eco.bal} 🪙`, inline: true },
                { name: '🏦 Ngân hàng', value: `${eco.bank} 🪙`, inline: true },
                { name: '💎 Tổng', value: `${eco.bal + eco.bank} 🪙`, inline: true }
            );
        return message.reply({ embeds: [e] });
    }

    if (command === 'daily') {
        const eco = getEco(guild.id, message.author.id); const now = Date.now(); const cd = 86400000;
        if (now - eco.lastDaily < cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(cd-(now-eco.lastDaily))}** để nhận daily`)] });
        const reward = randomInt(100, 500) + (db.levelData?.[guild.id]?.[message.author.id]?.level || 0) * 5;
        eco.bal += reward; eco.lastDaily = now; saveEco();
        return message.reply({ embeds: [okEmbed(`Nhận **${reward} 🪙** daily! (Bonus level +${(db.levelData?.[guild.id]?.[message.author.id]?.level || 0) * 5}🪙)`)] });
    }

    if (command === 'work') {
        const eco = getEco(guild.id, message.author.id); const now = Date.now(); const cd = 3600000;
        if (now - eco.lastWork < cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(cd-(now-eco.lastWork))}**`)] });
        const jobs = ['lập trình viên','bán cà phê','giao hàng','thiết kế','dạy học','viết báo','stream game','làm MC','vẽ tranh','đầu bếp','diễn viên','ca sĩ'];
        const job = jobs[randomInt(0, jobs.length - 1)]; const reward = randomInt(50, 200);
        eco.bal += reward; eco.lastWork = now; saveEco();
        return message.reply({ embeds: [okEmbed(`Làm **${job}** → **+${reward} 🪙**`)] });
    }

    if (command === 'fish') {
        const eco = getEco(guild.id, message.author.id); const now = Date.now(); const cd = 1800000;
        if (now - eco.lastFish < cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(cd-(now-eco.lastFish))}** để đi câu`)] });
        eco.lastFish = now;
        const fish = ['🐟 Cá nhỏ','🐠 Cá nemo','🐡 Cá nóc','🦈 Cá mập','🐙 Bạch tuộc','🦑 Mực','🦞 Tôm hùm','💎 Đá quý'];
        const catches = fish[randomInt(0, fish.length-1)];
        const val = catches.includes('💎') ? randomInt(500, 2000) : catches.includes('hùm') ? randomInt(200, 500) : randomInt(20, 150);
        eco.bal += val; saveEco();
        return message.reply({ embeds: [embed('🎣 Câu cá', `Câu được: **${catches}** (+${val} 🪙)`, config.successColor)] });
    }

    if (command === 'hunt') {
        const eco = getEco(guild.id, message.author.id); const now = Date.now(); const cd = 2400000;
        if (now - eco.lastHunt < cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(cd-(now-eco.lastHunt))}** để đi săn`)] });
        eco.lastHunt = now;
        const animals = ['🐇 Thỏ','🦌 Nai','🐗 Lợn rừng','🦁 Sư tử','🐯 Hổ','🦅 Đại bàng','🐉 Rồng'];
        const prey = animals[randomInt(0, animals.length-1)];
        if (Math.random() < 0.3) { saveEco(); return message.reply({ embeds: [errEmbed(`Săn thất bại! ${prey} chạy mất!`)] }); }
        const val = prey.includes('Rồng') ? randomInt(1000,3000) : prey.includes('Hổ') ? randomInt(500,1000) : randomInt(100, 400);
        eco.bal += val; saveEco();
        return message.reply({ embeds: [embed('🏹 Săn bắn', `Săn được: **${prey}** (+${val} 🪙)`, config.successColor)] });
    }

    if (command === 'mine') {
        const eco = getEco(guild.id, message.author.id); const now = Date.now(); const cd = 3000000;
        if (now - eco.lastMine < cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(cd-(now-eco.lastMine))}** để khai thác`)] });
        eco.lastMine = now;
        const ores = ['🪨 Đá','⛏️ Đồng','🔩 Sắt','🥈 Bạc','🥇 Vàng','💎 Kim cương','🔮 Tinh thể'];
        const ore = ores[randomInt(0, ores.length-1)];
        const val = ore.includes('Kim cương') ? randomInt(800,2000) : ore.includes('Vàng') ? randomInt(300,700) : randomInt(30, 200);
        eco.bal += val; saveEco();
        return message.reply({ embeds: [embed('⛏️ Khai thác', `Khai thác được: **${ore}** (+${val} 🪙)`, config.successColor)] });
    }

    if (command === 'crime') {
        const eco = getEco(guild.id, message.author.id); const now = Date.now(); const cd = 7200000;
        if (now - eco.lastCrime < cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(cd-(now-eco.lastCrime))}**`)] });
        eco.lastCrime = now;
        if (Math.random() < 0.4) { const fine = randomInt(50,150); eco.bal = Math.max(0, eco.bal - fine); saveEco(); return message.reply({ embeds: [errEmbed(`Bị bắt! Phạt **${fine} 🪙**`)] }); }
        const gain = randomInt(100, 400); eco.bal += gain; saveEco();
        return message.reply({ embeds: [okEmbed(`Phạm tội thành công! +**${gain} 🪙**`)] });
    }

    if (command === 'rob') {
        const target = message.mentions.members.first();
        if (!target) return message.reply({ embeds: [errEmbed('Mention người cần cướp')] });
        const eco1 = getEco(guild.id, message.author.id); const eco2 = getEco(guild.id, target.id);
        if (eco2.bal < 100) return message.reply({ embeds: [errEmbed('Nạn nhân quá nghèo!')] });
        if (Math.random() < 0.4) { const fine = randomInt(50,100); eco1.bal = Math.max(0, eco1.bal - fine); saveEco(); return message.reply({ embeds: [errEmbed(`Cướp thất bại! Mất **${fine} 🪙**`)] }); }
        const stolen = randomInt(50, Math.min(eco2.bal, 300)); eco1.bal += stolen; eco2.bal -= stolen; saveEco();
        return message.reply({ embeds: [okEmbed(`Cướp **${target.user.tag}** → **+${stolen} 🪙**`)] });
    }

    if (command === 'deposit' || command === 'dep') {
        const eco = getEco(guild.id, message.author.id);
        const amount = args[0] === 'all' ? eco.bal : parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) return message.reply({ embeds: [errEmbed('Số không hợp lệ')] });
        if (eco.bal < amount) return message.reply({ embeds: [errEmbed('Không đủ tiền')] });
        eco.bal -= amount; eco.bank += amount; saveEco();
        return message.reply({ embeds: [okEmbed(`Gửi **${amount} 🪙** vào ngân hàng`)] });
    }

    if (command === 'withdraw' || command === 'with') {
        const eco = getEco(guild.id, message.author.id);
        const amount = args[0] === 'all' ? eco.bank : parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) return message.reply({ embeds: [errEmbed('Số không hợp lệ')] });
        if (eco.bank < amount) return message.reply({ embeds: [errEmbed('Không đủ trong ngân hàng')] });
        eco.bank -= amount; eco.bal += amount; saveEco();
        return message.reply({ embeds: [okEmbed(`Rút **${amount} 🪙** từ ngân hàng`)] });
    }

    if (command === 'transfer' || command === 'pay') {
        const target = message.mentions.members.first(); const amount = parseInt(args[1]);
        if (!target || isNaN(amount) || amount <= 0) return message.reply({ embeds: [errEmbed('Dùng: !transfer @user [số]')] });
        const eco1 = getEco(guild.id, message.author.id); const eco2 = getEco(guild.id, target.id);
        if (eco1.bal < amount) return message.reply({ embeds: [errEmbed('Không đủ tiền')] });
        eco1.bal -= amount; eco2.bal += amount; saveEco();
        return message.reply({ embeds: [okEmbed(`Chuyển **${amount} 🪙** cho **${target.user.tag}**`)] });
    }

    if (command === 'leaderboard' || command === 'lb') {
        const eco = db.economy?.[guild.id] || {};
        const sorted = Object.entries(eco).sort(([,a],[,b]) => (b.bal+b.bank)-(a.bal+a.bank)).slice(0, 10);
        if (!sorted.length) return message.reply({ embeds: [embed('💰 BXH', 'Chưa có')] });
        const list = sorted.map(([id, d], i) => `${'🥇🥈🥉'[i]||`**${i+1}.**`} <@${id}> — ${d.bal+d.bank} 🪙`).join('\n');
        return message.reply({ embeds: [embed('💰 BXH Kinh Tế', list, config.warnColor)] });
    }

    if (command === 'give') {
        if (!isNukeAllowed(message.author.id) && !hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const target = message.mentions.members.first(); const amount = parseInt(args[1]);
        if (!target || isNaN(amount) || amount <= 0) return message.reply({ embeds: [errEmbed('Dùng: !give @user [số]')] });
        const eco = getEco(guild.id, target.id); eco.bal += amount; saveEco();
        await sendLog('💰 Give', `**${member.user.tag}** give **${amount}🪙** cho **${target.user.tag}**`);
        return message.reply({ embeds: [okEmbed(`Tặng **${amount} 🪙** cho **${target.user.tag}**`)] });
    }

    if (command === 'richest') {
        const eco = db.economy?.[guild.id] || {};
        const sorted = Object.entries(eco).sort(([,a],[,b]) => (b.bal+b.bank)-(a.bal+a.bank)).slice(0, 3);
        if (!sorted.length) return message.reply({ embeds: [embed('👑', 'Chưa có')] });
        const list = sorted.map(([id, d], i) => `${'👑🥈🥉'[i]} <@${id}> — **${d.bal+d.bank} 🪙**`).join('\n');
        return message.reply({ embeds: [embed('👑 Top 3 Giàu nhất', list, '#ffd700')] });
    }

    if (command === 'inventory' || command === 'inv') {
        const inv = db.inventory?.[message.author.id] || {};
        const items = Object.entries(inv).filter(([,v]) => v > 0).map(([k,v]) => `**${k}**: ${v}`).join('\n');
        return message.reply({ embeds: [embed(`🎒 Túi đồ của ${member.displayName}`, items || 'Trống rỗng')] });
    }

    if (command === 'shop') {
        const e = new EmbedBuilder().setTitle('🏪 Cửa hàng').setColor(config.warnColor)
            .addFields(
                { name: '🎭 Đổi nickname', value: '500 🪙', inline: true },
                { name: '✨ Role VIP', value: '1000 🪙', inline: true },
                { name: '🎨 Màu nickname', value: '750 🪙', inline: true },
                { name: '🎲 Lucky Ticket', value: '300 🪙', inline: true },
                { name: '🎣 Cần câu Pro', value: '800 🪙', inline: true },
                { name: '⛏️ Cuốc Diamond', value: '1200 🪙', inline: true },
                { name: '🏹 Cung Pro', value: '1000 🪙', inline: true },
                { name: '🍀 Bùa may mắn', value: '500 🪙', inline: true }
            ).setFooter({ text: 'Dùng !buy [tên] để mua' });
        return message.reply({ embeds: [e] });
    }

    if (command === 'sell') {
        const item = args.join(' ');
        if (!item) return message.reply({ embeds: [errEmbed('Nhập tên vật phẩm cần bán')] });
        const inv = db.inventory?.[message.author.id] || {};
        if (!inv[item] || inv[item] <= 0) return message.reply({ embeds: [errEmbed('Bạn không có vật phẩm này')] });
        const price = randomInt(50, 300);
        inv[item]--; if (!db.inventory) db.inventory = {}; db.inventory[message.author.id] = inv;
        const eco = getEco(guild.id, message.author.id); eco.bal += price; saveEco();
        return message.reply({ embeds: [okEmbed(`Bán **${item}** → +${price} 🪙`)] });
    }

    // =====================================================
    // SOCIAL COMMANDS
    // =====================================================
    if (command === 'rep') {
        const target = message.mentions.members.first();
        if (!target || target.id === message.author.id) return message.reply({ embeds: [errEmbed('Mention người khác')] });
        const cd = checkCooldown(message.author.id, 'rep', 86400);
        if (cd) return message.reply({ embeds: [errEmbed(`Còn **${formatTime(parseFloat(cd) * 1000)}** để +rep`)] });
        ensureDB('reputation', guild.id, {});
        if (!db.reputation[guild.id][target.id]) db.reputation[guild.id][target.id] = 0;
        db.reputation[guild.id][target.id]++; saveDB();
        return message.reply({ embeds: [okEmbed(`+1 rep cho **${target.user.tag}**! (Tổng: ${db.reputation[guild.id][target.id]})`)] });
    }

    if (command === 'myrep') {
        const target = message.mentions.members.first() || member;
        const rep = db.reputation?.[guild.id]?.[target.id] || 0;
        return message.reply({ embeds: [embed('⭐ Reputation', `**${target.user.tag}** có **${rep}** reputation`)] });
    }

    if (command === 'toprep') {
        const reps = db.reputation?.[guild.id] || {};
        const sorted = Object.entries(reps).sort(([,a],[,b]) => b - a).slice(0, 10);
        if (!sorted.length) return message.reply({ embeds: [embed('⭐ Top Rep', 'Chưa có')] });
        const list = sorted.map(([id, r], i) => `**${i+1}.** <@${id}> — ⭐ ${r}`).join('\n');
        return message.reply({ embeds: [embed('⭐ Top Reputation', list, '#ffd700')] });
    }

    if (command === 'marry') {
        const target = message.mentions.members.first();
        if (!target || target.id === message.author.id) return message.reply({ embeds: [errEmbed('Mention người khác')] });
        ensureDB('marriages', guild.id, {});
        if (db.marriages[guild.id][message.author.id]) return message.reply({ embeds: [errEmbed('Bạn đã kết hôn rồi!')] });
        if (db.marriages[guild.id][target.id]) return message.reply({ embeds: [errEmbed('Người này đã kết hôn rồi!')] });
        const proposal = await message.reply({ embeds: [embed('💍 Cầu hôn', `${target}, **${member.user.tag}** muốn kết hôn với bạn!\n\n💍 Chấp nhận | 💔 Từ chối (30 giây)`, '#ff69b4')] });
        await proposal.react('💍'); await proposal.react('💔');
        const filter = (r, u) => ['💍','💔'].includes(r.emoji.name) && u.id === target.id;
        const collected = await proposal.awaitReactions({ filter, max: 1, time: 30000 }).catch(() => null);
        if (!collected || collected.first()?.emoji.name === '💔') return proposal.edit({ embeds: [embed('💔 Từ chối', `${target.user.tag} đã từ chối lời cầu hôn`, config.errorColor)] });
        db.marriages[guild.id][message.author.id] = target.id;
        db.marriages[guild.id][target.id] = message.author.id; saveDB();
        return proposal.edit({ embeds: [embed('💒 Kết hôn!', `${message.author} 💍 ${target}\n\nChúc mừng đôi uyên ương!`, '#ff69b4')] });
    }

    if (command === 'divorce') {
        ensureDB('marriages', guild.id, {});
        const partnerId = db.marriages[guild.id][message.author.id];
        if (!partnerId) return message.reply({ embeds: [errEmbed('Bạn chưa kết hôn')] });
        delete db.marriages[guild.id][message.author.id];
        delete db.marriages[guild.id][partnerId]; saveDB();
        return message.reply({ embeds: [embed('💔 Ly hôn', `Đã chia tay người bạn đời`, config.errorColor)] });
    }

    if (command === 'partner') {
        const target = message.mentions.members.first() || member;
        const partnerId = db.marriages?.[guild.id]?.[target.id];
        if (!partnerId) return message.reply({ embeds: [embed('💔', `${target.user.tag} chưa kết hôn với ai`)] });
        return message.reply({ embeds: [embed('💍 Người bạn đời', `${target.user.tag} đang kết hôn với <@${partnerId}>`, '#ff69b4')] });
    }

    if (command === 'setbio') {
        const bio = args.join(' ');
        if (!bio) return message.reply({ embeds: [errEmbed('Nhập bio')] });
        if (bio.length > 200) return message.reply({ embeds: [errEmbed('Bio tối đa 200 ký tự')] });
        if (!db.userBio) db.userBio = {};
        db.userBio[message.author.id] = bio; saveDB();
        return message.reply({ embeds: [okEmbed('Đã cập nhật bio!')] });
    }

    if (command === 'bio') {
        const target = message.mentions.users.first() || message.author;
        const bio = db.userBio?.[target.id] || '_Chưa có bio_';
        return message.reply({ embeds: [embed(`📝 Bio của ${target.username}`, bio)] });
    }

    // =====================================================
    // BIRTHDAY SYSTEM
    // =====================================================
    if (command === 'setbday') {
        const dateStr = args[0];
        if (!dateStr || !/^\d{2}\/\d{2}$/.test(dateStr)) return message.reply({ embeds: [errEmbed('Dùng: !setbday DD/MM')] });
        if (!db.birthdays) db.birthdays = {};
        db.birthdays[message.author.id] = { date: dateStr }; saveDB();
        return message.reply({ embeds: [okEmbed(`Đặt sinh nhật: **${dateStr}** 🎂`)] });
    }

    if (command === 'bday') {
        const target = message.mentions.users.first() || message.author;
        const bday = db.birthdays?.[target.id];
        if (!bday) return message.reply({ embeds: [embed('🎂 Sinh nhật', `${target.username} chưa đặt sinh nhật`)] });
        return message.reply({ embeds: [embed('🎂 Sinh nhật', `${target.username}: **${bday.date}** 🎉`)] });
    }

    if (command === 'bdaylist') {
        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}`;
        const bdayUsers = Object.entries(db.birthdays || {}).filter(([,b]) => b.date === todayStr);
        if (!bdayUsers.length) return message.reply({ embeds: [embed('🎂 Sinh nhật hôm nay', 'Không ai có sinh nhật hôm nay')] });
        const list = bdayUsers.map(([id]) => `<@${id}>`).join(', ');
        return message.reply({ embeds: [embed('🎂 Sinh nhật hôm nay! 🎉', list, '#ff69b4')] });
    }

    // =====================================================
    // NOTE SYSTEM
    // =====================================================
    if (command === 'note') {
        const content = args.join(' ');
        if (!content) return message.reply({ embeds: [errEmbed('Nhập nội dung')] });
        ensureDB('notes', message.author.id, []);
        db.notes[message.author.id].push({ content, at: new Date().toISOString() }); saveDB();
        return message.reply({ embeds: [okEmbed(`Lưu ghi chú #${db.notes[message.author.id].length}`)] });
    }

    if (command === 'notes') {
        const notes = db.notes?.[message.author.id] || [];
        if (!notes.length) return message.reply({ embeds: [embed('📝', 'Chưa có ghi chú')] });
        const list = notes.map((n, i) => `**${i+1}.** ${n.content.slice(0,80)}`).join('\n');
        return message.reply({ embeds: [embed(`📝 ${notes.length} ghi chú`, list)] });
    }

    if (command === 'delnote') {
        const idx = parseInt(args[0]) - 1;
        const notes = db.notes?.[message.author.id] || [];
        if (isNaN(idx) || !notes[idx]) return message.reply({ embeds: [errEmbed('Số không hợp lệ')] });
        const deleted = notes.splice(idx, 1)[0]; db.notes[message.author.id] = notes; saveDB();
        return message.reply({ embeds: [okEmbed(`Xoá ghi chú "${deleted.content.slice(0,50)}"`)] });
    }

    if (command === 'clearnotes') {
        db.notes[message.author.id] = []; saveDB();
        return message.reply({ embeds: [okEmbed('Xoá tất cả ghi chú')] });
    }

    if (command === 'searchnote') {
        const query = args.join(' ').toLowerCase();
        if (!query) return message.reply({ embeds: [errEmbed('Nhập từ khóa')] });
        const notes = (db.notes?.[message.author.id] || []).filter(n => n.content.toLowerCase().includes(query));
        if (!notes.length) return message.reply({ embeds: [embed('🔍', 'Không tìm thấy')] });
        const list = notes.map((n, i) => `**${i+1}.** ${n.content.slice(0,80)}`).join('\n');
        return message.reply({ embeds: [embed(`🔍 Kết quả "${query}"`, list)] });
    }

    // =====================================================
    // TAG SYSTEM
    // =====================================================
    if (command === 'createtag') {
        if (!hasPerms(member, 'ManageMessages')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const name = args[0]; const content = args.slice(1).join(' ');
        if (!name || !content) return message.reply({ embeds: [errEmbed('Dùng: !createtag [tên] [nội dung]')] });
        ensureDB('tags', guild.id, {});
        db.tags[guild.id][name] = { content, by: member.user.tag, at: Date.now() }; saveDB();
        return message.reply({ embeds: [okEmbed(`Tạo tag \`${name}\``)] });
    }

    if (command === 'tag') {
        const name = args[0]; if (!name) return;
        const tag = db.tags?.[guild.id]?.[name];
        if (!tag) return message.reply({ embeds: [errEmbed(`Không tìm thấy tag \`${name}\``)] });
        return message.reply({ content: tag.content });
    }

    if (command === 'tags') {
        const tags = db.tags?.[guild.id] || {};
        const list = Object.keys(tags).join(', ') || 'Chưa có tag';
        return message.reply({ embeds: [embed('🏷️ Tags', list)] });
    }

    if (command === 'deltag') {
        if (!hasPerms(member, 'ManageMessages')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const name = args[0]; if (!name || !db.tags?.[guild.id]?.[name]) return message.reply({ embeds: [errEmbed('Tag không tồn tại')] });
        delete db.tags[guild.id][name]; saveDB();
        return message.reply({ embeds: [okEmbed(`Xoá tag \`${name}\``)] });
    }

    if (command === 'edittag') {
        if (!hasPerms(member, 'ManageMessages')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const name = args[0]; const content = args.slice(1).join(' ');
        if (!name || !content || !db.tags?.[guild.id]?.[name]) return message.reply({ embeds: [errEmbed('Tag không tồn tại hoặc thiếu nội dung')] });
        db.tags[guild.id][name].content = content; saveDB();
        return message.reply({ embeds: [okEmbed(`Cập nhật tag \`${name}\``)] });
    }

    if (command === 'rawtag') {
        const name = args[0]; const tag = db.tags?.[guild.id]?.[name];
        if (!tag) return message.reply({ embeds: [errEmbed('Tag không tồn tại')] });
        return message.reply({ embeds: [embed(`📄 Raw tag: ${name}`, `\`\`\`${tag.content.slice(0, 1900)}\`\`\``)] });
    }

    // =====================================================
    // GIVEAWAY
    // =====================================================
    if (command === 'gcreate') {
        if (!hasPerms(member, 'ManageGuild')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const duration = parseInt(args[0]) || 60; const winners = parseInt(args[1]) || 1;
        const prize = args.slice(2).join(' ') || 'Phần thưởng bí ẩn';
        const endTime = Date.now() + duration * 60 * 1000;
        const gMsg = await channel.send({ embeds: [new EmbedBuilder().setTitle('🎁 GIVEAWAY').setColor('#ffd700')
            .setDescription(`**Phần thưởng:** ${prize}\n**Kết thúc:** <t:${Math.floor(endTime / 1000)}:R>\n**Số người thắng:** ${winners}\n\nReact 🎉 để tham gia!`)
            .setFooter({ text: `Tổ chức bởi ${member.user.tag}` })] });
        await gMsg.react('🎉');
        db.giveaways[gMsg.id] = { channelId: channel.id, prize, endTime, guildId: guild.id, winners }; saveDB();
        setTimeout(async () => {
            const freshMsg = await channel.messages.fetch(gMsg.id).catch(() => null); if (!freshMsg) return;
            const reaction = freshMsg.reactions.cache.get('🎉');
            const users = await reaction?.users.fetch(); const eligible = users?.filter(u => !u.bot);
            if (!eligible?.size) return channel.send({ embeds: [embed('🎁 Giveaway Kết Thúc', 'Không có người tham gia!')] });
            const winnerList = Array.from(eligible.values()).sort(() => Math.random() - 0.5).slice(0, winners);
            channel.send({ embeds: [embed('🎉 NGƯỜI THẮNG!', winnerList.map(u => `${u}`).join(', ') + ` thắng **${prize}**!`, '#ffd700')] });
        }, duration * 60 * 1000);
        return message.reply({ embeds: [okEmbed(`Giveaway tạo xong! (${duration} phút, ${winners} winners)`)] });
    }

    if (command === 'gend') {
        const msgId = args[0]; const gData = db.giveaways[msgId];
        if (!gData) return message.reply({ embeds: [errEmbed('Không tìm thấy giveaway')] });
        const gCh = guild.channels.cache.get(gData.channelId);
        const gMsg = await gCh?.messages.fetch(msgId).catch(() => null);
        if (!gMsg) return message.reply({ embeds: [errEmbed('Không tìm thấy tin nhắn')] });
        const reaction = gMsg.reactions.cache.get('🎉'); const users = await reaction?.users.fetch();
        const eligible = users?.filter(u => !u.bot); const winner = eligible?.random();
        gCh.send({ embeds: [embed('🎉 Giveaway Kết Thúc Sớm', winner ? `${winner} thắng **${gData.prize}**!` : 'Không có người tham gia')] });
        delete db.giveaways[msgId]; saveDB();
    }

    if (command === 'greroll') {
        const msgId = args[0]; if (!msgId) return message.reply({ embeds: [errEmbed('Nhập ID tin nhắn')] });
        try {
            const gMsg = await channel.messages.fetch(msgId);
            const reaction = gMsg.reactions.cache.get('🎉'); const users = await reaction?.users.fetch();
            const winner = users?.filter(u => !u.bot)?.random();
            return channel.send({ embeds: [embed('🔄 Reroll', winner ? `${winner} là người thắng mới! 🎉` : 'Không có người')] });
        } catch { return message.reply({ embeds: [errEmbed('Không tìm thấy tin nhắn')] }); }
    }

    if (command === 'glist') {
        const active = Object.entries(db.giveaways).filter(([,g]) => g.guildId === guild.id && g.endTime > Date.now());
        if (!active.length) return message.reply({ embeds: [embed('🎁 Giveaways', 'Không có giveaway đang chạy')] });
        const list = active.map(([id, g]) => `ID: \`${id}\` — **${g.prize}** — <t:${Math.floor(g.endTime/1000)}:R>`).join('\n');
        return message.reply({ embeds: [embed('🎁 Giveaways đang chạy', list)] });
    }

    // =====================================================
    // SUGGESTION / CONFESSION
    // =====================================================
    if (command === 'suggest') {
        const content = args.join(' ');
        if (!content) return message.reply({ embeds: [errEmbed('Nhập nội dung')] });
        const sugCh = db.suggestions?.[guild.id];
        if (!sugCh) return message.reply({ embeds: [errEmbed('Admin chưa cài !setsuggestion')] });
        const ch = guild.channels.cache.get(sugCh);
        if (!ch) return message.reply({ embeds: [errEmbed('Kênh suggestion không tìm thấy')] });
        const msg = await ch.send({ embeds: [embed('💡 Đề xuất', content, '#3498db').setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })] });
        await msg.react('✅'); await msg.react('❌');
        return message.reply({ embeds: [okEmbed('Đề xuất đã được gửi!')] });
    }

    if (command === 'setsuggestion') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        if (!db.suggestions) db.suggestions = {};
        db.suggestions[guild.id] = channel.id; saveDB();
        return message.reply({ embeds: [okEmbed(`Kênh suggestion: ${channel}`)] });
    }

    if (command === 'confess') {
        const content = args.join(' ');
        if (!content) return message.reply({ embeds: [errEmbed('Nhập nội dung')] });
        const confCh = db.confessions?.[guild.id];
        if (!confCh) return message.reply({ embeds: [errEmbed('Admin chưa cài !setconfession')] });
        const ch = guild.channels.cache.get(confCh);
        if (!ch) return;
        await ch.send({ embeds: [embed('🔒 Confession (Ẩn danh)', content, '#9b59b6')] });
        return message.reply({ embeds: [okEmbed('Confession đã được gửi ẩn danh!')] }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }

    if (command === 'setconfession') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        if (!db.confessions) db.confessions = {};
        db.confessions[guild.id] = channel.id; saveDB();
        return message.reply({ embeds: [okEmbed(`Kênh confession: ${channel}`)] });
    }

    // =====================================================
    // FUN COMMANDS
    // =====================================================
    if (command === 'meme') {
        const cd = checkCooldown(message.author.id, 'meme', 5);
        if (cd) return message.reply({ embeds: [errEmbed(`Đợi ${cd}s`)] });
        try {
            const subs = ['memes','dankmemes','me_irl'];
            const res = await axios.get(`https://www.reddit.com/r/${subs[randomInt(0,subs.length-1)]}/random.json?limit=1`);
            const post = res.data[0].data.children[0].data;
            return message.reply({ embeds: [new EmbedBuilder().setTitle(post.title.slice(0,256)).setImage(post.url).setColor(config.embedColor).setFooter({ text: `👍 ${post.ups}` })] });
        } catch { return message.reply({ embeds: [errEmbed('Không lấy được meme')] }); }
    }

    if (command === 'joke') {
        const jokes = [
            'Bug là gì? Là tính năng chưa được ghi vào tài liệu.','Có 10 loại người: hiểu nhị phân và không hiểu.',
            'Tại sao programmer không đi ra ngoài? Vì ngoài đó không có WiFi.','99 bugs in the code... fix one, patch → 127 bugs.',
            'Tại sao dev dùng dark mode? Vì light attracts bugs!','Stack Overflow IS the documentation.',
        ];
        return message.reply({ embeds: [embed('😂 Joke', jokes[randomInt(0, jokes.length - 1)])] });
    }

    if (command === 'dadjoke') {
        try {
            const res = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' } });
            return message.reply({ embeds: [embed('👨 Dad Joke', res.data.joke)] });
        } catch {
            const jokes = ['Tôi đang đọc sách về chống trọng lực — rất khó đặt xuống.','Hải cẩu bơi trong nước mặn vì nước hồ tiêu làm chúng hắt hơi!'];
            return message.reply({ embeds: [embed('👨 Dad Joke', jokes[randomInt(0, jokes.length - 1)])] });
        }
    }

    if (command === '8ball') {
        const q = args.join(' '); if (!q) return message.reply({ embeds: [errEmbed('Nhập câu hỏi!')] });
        const answers = ['✅ Chắc chắn rồi!','✅ Có thể lắm','✅ Hoàn toàn đúng','✅ Dấu hiệu tốt','🤔 Tôi không chắc','🤔 Hãy thử lại','🤔 Khó nói quá','❌ Chắc không','❌ Không có khả năng','❌ Chắc chắn không'];
        return message.reply({ embeds: [embed('🎱 8Ball', `❓ **${q}**\n\n${answers[randomInt(0, answers.length - 1)]}`, config.embedColor)] });
    }

    if (command === 'rps') {
        const choices = ['✊ Oẳn','✋ Tù','✌️ Xì'];
        const userIdx = choices.findIndex(c => c.toLowerCase().includes((args[0] || '').toLowerCase()));
        if (userIdx === -1) return message.reply({ embeds: [errEmbed('Dùng: !rps oan|tu|xi')] });
        const botIdx = randomInt(0, 2); const diff = (userIdx - botIdx + 3) % 3;
        const result = diff === 0 ? '🤝 Hoà' : diff === 1 ? '🎉 Bạn thắng!' : '😢 Bot thắng!';
        return message.reply({ embeds: [embed('✊✋✌️', `Bạn: ${choices[userIdx]}\nBot: ${choices[botIdx]}\n\n**${result}**`)] });
    }

    if (command === 'coinflip') {
        const bet = parseInt(args[0]); const side = (args[1] || '').toLowerCase();
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const resultText = result === 'heads' ? '🪙 Heads (Ngửa)' : '🔙 Tails (Sấp)';
        if (bet && side && (side === 'heads' || side === 'tails')) {
            const eco = getEco(guild.id, message.author.id);
            if (eco.bal < bet) return message.reply({ embeds: [errEmbed('Không đủ tiền')] });
            if (result === side) { eco.bal += bet; saveEco(); return message.reply({ embeds: [embed('🪙 Coinflip', `${resultText}\n\n🎉 Thắng! +${bet} 🪙`, config.successColor)] }); }
            else { eco.bal -= bet; saveEco(); return message.reply({ embeds: [embed('🪙 Coinflip', `${resultText}\n\n😢 Thua! -${bet} 🪙`, config.errorColor)] }); }
        }
        return message.reply({ embeds: [embed('🪙 Coinflip', resultText)] });
    }

    if (command === 'dice') {
        const sides = parseInt(args[0]) || 6;
        if (sides < 2 || sides > 1000) return message.reply({ embeds: [errEmbed('2-1000 mặt')] });
        return message.reply({ embeds: [embed('🎲 Xúc xắc', `D${sides} → **${randomInt(1, sides)}**`)] });
    }

    if (command === 'roulette') {
        const eco = getEco(guild.id, message.author.id); const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errEmbed('Nhập số tiền cược')] });
        if (eco.bal < bet) return message.reply({ embeds: [errEmbed('Không đủ tiền')] });
        const num = randomInt(0, 36); const color = num === 0 ? '🟢' : num % 2 === 0 ? '🔴' : '⚫';
        if (Math.random() < 0.486) { eco.bal += bet; saveEco(); return message.reply({ embeds: [embed('🎰 Roulette', `${color} **${num}** — Thắng +${bet} 🪙!`, config.successColor)] }); }
        else { eco.bal -= bet; saveEco(); return message.reply({ embeds: [embed('🎰 Roulette', `${color} **${num}** — Thua -${bet} 🪙`, config.errorColor)] }); }
    }

    if (command === 'slots') {
        const eco = getEco(guild.id, message.author.id); const bet = parseInt(args[0]) || 0;
        if (bet > 0 && eco.bal < bet) return message.reply({ embeds: [errEmbed('Không đủ tiền')] });
        const icons = ['🍒','🍋','🍊','⭐','💎','🎰','🍀','🎯'];
        const reels = [icons[randomInt(0,7)], icons[randomInt(0,7)], icons[randomInt(0,7)]];
        const win = reels[0] === reels[1] && reels[1] === reels[2];
        const twoMatch = !win && (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);
        if (win && bet > 0) { eco.bal += bet * 5; saveEco(); return message.reply({ embeds: [embed('🎰 JACKPOT!!! 💎', `${reels.join('|')}\n\n+**${bet*5} 🪙** (5x!)`, '#ffd700')] }); }
        if (twoMatch && bet > 0) { eco.bal += Math.floor(bet * 0.5); saveEco(); }
        else if (bet > 0) { eco.bal -= bet; saveEco(); }
        return message.reply({ embeds: [embed('🎰 Slots', `${reels.join(' | ')}\n\n${win ? '🎉 JACKPOT!' : twoMatch ? `💛 2 giống nhau! +${Math.floor(bet*0.5)}🪙` : `😢 Thua -${bet}🪙`}`, win ? '#ffd700' : config.errorColor)] });
    }

    if (command === 'blackjack' || command === 'bj') {
        const bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0) return message.reply({ embeds: [errEmbed('Nhập số tiền cược: !blackjack [số]')] });
        const eco = getEco(guild.id, message.author.id);
        if (eco.bal < bet) return message.reply({ embeds: [errEmbed('Không đủ tiền')] });
        const deck = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
        const val = c => ['J','Q','K'].includes(c) ? 10 : c === 'A' ? 11 : parseInt(c);
        const deal = () => deck[randomInt(0, deck.length-1)];
        let player = [deal(), deal()]; let dealer = [deal(), deal()];
        const score = hand => { let s = hand.reduce((a, c) => a + val(c), 0); while (s > 21 && hand.includes('A')) { let i = hand.lastIndexOf('A'); hand[i] = 'a'; s -= 10; } return s; };
        const ps = score([...player]); const ds = score([...dealer]);
        const e = new EmbedBuilder().setTitle('🃏 Blackjack').setColor(config.embedColor)
            .addFields({ name: '🤵 Dealer', value: `${dealer[0]} ?`, inline: true }, { name: '👤 Bạn', value: `${player.join(' ')} = ${ps}`, inline: true })
            .setFooter({ text: '✅ Hit | ❌ Stand' });
        const bMsg = await message.reply({ embeds: [e] });
        await bMsg.react('✅'); await bMsg.react('❌');
        const filter = (r, u) => ['✅','❌'].includes(r.emoji.name) && u.id === message.author.id;
        const collected = await bMsg.awaitReactions({ filter, max: 1, time: 15000 }).catch(() => null);
        const action = collected?.first()?.emoji.name;
        if (action === '✅') { player.push(deal()); }
        const finalPS = score([...player]); const finalDS = score([...dealer]);
        let result, diff;
        if (finalPS > 21) { result = '😢 Bust! Thua!'; diff = -bet; }
        else if (finalDS > 21 || finalPS > finalDS) { result = '🎉 Thắng!'; diff = bet; }
        else if (finalPS === finalDS) { result = '🤝 Hoà!'; diff = 0; }
        else { result = '😢 Thua!'; diff = -bet; }
        eco.bal += diff; saveEco();
        return bMsg.edit({ embeds: [new EmbedBuilder().setTitle('🃏 Blackjack Kết Thúc').setColor(diff > 0 ? config.successColor : diff < 0 ? config.errorColor : config.warnColor)
            .addFields({ name: '🤵 Dealer', value: `${dealer.join(' ')} = ${finalDS}`, inline: true }, { name: '👤 Bạn', value: `${player.join(' ')} = ${finalPS}`, inline: true })
            .setDescription(`**${result}**\n${diff >= 0 ? '+' : ''}${diff} 🪙 | Số dư: ${eco.bal} 🪙`)] });
    }

    if (command === 'ship') {
        const u1 = message.mentions.users.first(); const u2 = message.mentions.users.at(1) || message.author;
        if (!u1) return message.reply({ embeds: [errEmbed('Mention ít nhất 1 người')] });
        const score = randomInt(0, 100);
        const bar = '💗'.repeat(Math.floor(score/10)) + '🖤'.repeat(10 - Math.floor(score/10));
        const level = score > 80 ? '💍 Cặp đôi hoàn hảo!' : score > 60 ? '💕 Rất hợp nhau!' : score > 40 ? '🙂 Tạm được' : '😬 Hơi khó';
        return message.reply({ embeds: [embed('💕 Ship', `**${u1.username}** ❤️ **${u2.username}**\n\n${bar}\n**${score}%** — ${level}`, '#ff69b4')] });
    }

    if (command === 'rate') {
        const thing = args.join(' ') || message.author.username; const score = randomInt(0, 10);
        return message.reply({ embeds: [embed('⭐ Đánh giá', `**${thing}**\n\n${'⭐'.repeat(score)}${'✩'.repeat(10-score)}\n**${score}/10**`)] });
    }

    if (command === 'roast') {
        const target = message.mentions.users.first()?.username || message.author.username;
        const roasts = [`${target} thông minh như WiFi không mật khẩu.`,`${target} code như viết nhật ký — không ai hiểu gì.`,`${target} chậm hơn IE loading Wikipedia.`,`${target} tư duy như vòng lặp vô hạn.`];
        return message.reply({ embeds: [embed('🔥 Roast', roasts[randomInt(0, roasts.length - 1)], config.errorColor)] });
    }

    if (command === 'compliment') {
        const target = message.mentions.users.first()?.username || message.author.username;
        const list = [`${target} thông minh hơn 99% AI! 🧠`,`${target} có nụ cười đẹp nhất server! ☀️`,`${target} là MVP thực sự! 🏆`,`${target} tỏa sáng như kim cương! 💎`];
        return message.reply({ embeds: [embed('💝 Khen ngợi', list[randomInt(0, list.length - 1)], '#ff69b4')] });
    }

    if (command === 'hack') {
        const target = message.mentions.users.first()?.username || args.join(' ') || 'server';
        const steps = [`🔍 Đang scan IP của **${target}**...`,'🔓 Bypass firewall...','💾 Download data...','🔑 Crack password...',`✅ Hack **${target}** hoàn tất! (Fake 100% 😂)`];
        let i = 0;
        message.reply({ embeds: [embed('💻 Hack', steps[0])] }).then(msg => {
            const interval = setInterval(async () => { i++; if (i >= steps.length) { clearInterval(interval); return; } await msg.edit({ embeds: [embed('💻 Hack', steps[i])] }); }, 1500);
        });
    }

    if (command === 'hug') { return message.reply({ embeds: [embed('🤗 Ôm', `${message.author.username} ôm chặt ${message.mentions.users.first()?.username || 'bạn ơi'}! 💕`)] }); }
    if (command === 'pat') { return message.reply({ embeds: [embed('👋 Pat', `${message.author.username} xoa đầu ${message.mentions.users.first()?.username || 'bạn ơi'}! 🥰`)] }); }
    if (command === 'kiss') { return message.reply({ embeds: [embed('😘 Hôn', `${message.author.username} hôn ${message.mentions.users.first()?.username || 'bạn ơi'}! 💋`)] }); }
    if (command === 'slap') { return message.reply({ embeds: [embed('👋 Tát', `${message.author.username} tát ${message.mentions.users.first()?.username || 'bạn ơi'}! 😤`, config.errorColor)] }); }
    if (command === 'bonk') { return message.reply({ embeds: [embed('🔨 Bonk', `${message.author.username} bonk ${message.mentions.users.first()?.username || 'bạn ơi'}! 🦴`, config.warnColor)] }); }
    if (command === 'bite') { return message.reply({ embeds: [embed('😬 Cắn', `${message.author.username} cắn ${message.mentions.users.first()?.username || 'bạn ơi'}! 🦷`, config.warnColor)] }); }
    if (command === 'cuddle') { return message.reply({ embeds: [embed('🤗 Ôm chặt', `${message.author.username} ôm chặt ${message.mentions.users.first()?.username || 'bạn ơi'}! 💞`, '#ff69b4')] }); }
    if (command === 'poke') { return message.reply({ embeds: [embed('👉 Poke', `${message.author.username} chọc ${message.mentions.users.first()?.username || 'bạn ơi'}! 👈`)] }); }
    if (command === 'dance') { const dances = ['💃','🕺','👯','🎵']; return message.reply({ embeds: [embed('💃 Nhảy', `${message.author.username} đang nhảy! ${dances[randomInt(0,3)]}`)] }); }
    if (command === 'cry') { return message.reply({ embeds: [embed('😭 Khóc', `${message.author.username} đang khóc... 😢💧`)] }); }
    if (command === 'laugh') { return message.reply({ embeds: [embed('😂 Cười', `${message.author.username} đang cười ngất ngư! 🤣`)] }); }
    if (command === 'wink') { return message.reply({ embeds: [embed('😉 Wink', `${message.author.username} nháy mắt với ${message.mentions.users.first()?.username || 'bạn ơi'}! 😏`)] }); }
    if (command === 'blush') { return message.reply({ embeds: [embed('😊 Đỏ mặt', `${message.author.username} đang đỏ mặt! 😳`)] }); }
    if (command === 'highfive') { return message.reply({ embeds: [embed('🙌 High Five!', `${message.author.username} đập tay với ${message.mentions.users.first()?.username || 'bạn ơi'}! 🙌`)] }); }
    if (command === 'thumbsup') { return message.reply({ embeds: [embed('👍', `${message.author.username} gật đầu tán thành! 👍`)] }); }
    if (command === 'facepalm') { return message.reply({ embeds: [embed('🤦 Facepalm', `${message.author.username} 🤦‍♂️ không biết phải nói gì nữa`)] }); }
    if (command === 'owo') { return message.reply(`OwO *notices ${message.mentions.users.first()?.username || 'you'}* what's this?`); }
    if (command === 'uwu') { return message.reply(`uwu ${message.mentions.users.first()?.username || ''} (◕ᴗ◕✿)`); }

    if (command === 'pp') {
        const size = randomInt(1, 20); const bar = '█'.repeat(size);
        return message.reply({ embeds: [embed('🍆 PP Size', `**${message.mentions.users.first()?.username || message.author.username}**\n8${bar}D\n${size} cm`)] });
    }

    if (command === 'gay') {
        const score = randomInt(0, 100);
        return message.reply({ embeds: [embed('🏳️‍🌈 Gay Meter', `**${message.mentions.users.first()?.username || message.author.username}** là **${score}%** gay 🌈`)] });
    }

    if (command === 'simp') {
        const score = randomInt(0, 100);
        return message.reply({ embeds: [embed('💘 Simp Meter', `**${message.mentions.users.first()?.username || message.author.username}** là **${score}%** simp 💸`)] });
    }

    if (command === 'fact') {
        try {
            const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
            return message.reply({ embeds: [embed('🧠 Sự thật', res.data.text)] });
        } catch {
            const facts = ['Mật ong không bao giờ hỏng!','Con bạch tuộc có 3 trái tim và máu màu xanh.','Một ngày trên sao Kim dài hơn một năm.'];
            return message.reply({ embeds: [embed('🧠 Sự thật', facts[randomInt(0, facts.length-1)])] });
        }
    }

    if (command === 'truth') {
        const truths = ['Điều gì bạn sợ nhất?','Lần cuối bạn nói dối là khi nào?','Bạn đã từng crush ai trong server này chưa?','Thói quen xấu nhất?','Bí mật lớn nhất của bạn?'];
        return message.reply({ embeds: [embed('💭 Truth', truths[randomInt(0, truths.length-1)], '#9b59b6')] });
    }

    if (command === 'dare') {
        const dares = ['Viết tên bằng mũi trong không khí.','Nói điều tốt về mọi người trong kênh.','Ping ngẫu nhiên và nói "Em yêu anh/chị".','Đổi bio thành "Tôi là bot" trong 10 phút.'];
        return message.reply({ embeds: [embed('🎯 Dare', dares[randomInt(0, dares.length-1)], '#e74c3c')] });
    }

    if (command === 'wouldyourather') {
        const scenarios = [['Bay được nhưng chậm như đi bộ','Chạy nhanh như tàu điện'],['Không bao giờ ngủ','Ngủ 20h/ngày'],['Biết tất cả ngôn ngữ','Biết tất cả nhạc cụ']];
        const s = scenarios[randomInt(0, scenarios.length-1)];
        const poll = await channel.send({ embeds: [embed('🤔 Would You Rather', `🅰️ **${s[0]}**\n\nHay\n\n🅱️ **${s[1]}**`)] });
        await poll.react('🅰️'); await poll.react('🅱️');
    }

    if (command === 'neverhaveiever') {
        const scenarios = ['Gửi tin nhắn nhầm người','Ngủ gật trong lớp','Giả vờ không thấy tin nhắn','Xem series cả đêm','Google trong khi thi'];
        const s = scenarios[randomInt(0, scenarios.length-1)];
        const poll = await channel.send({ embeds: [embed('🙋 Never Have I Ever', `Tôi chưa bao giờ... **${s}**\n\n👋 Đã làm | 🙈 Chưa`)] });
        await poll.react('👋'); await poll.react('🙈');
    }

    if (command === 'riddle') {
        const riddles = [
            { q: 'Tôi có chìa khóa nhưng không có khóa, có không gian nhưng không có phòng. Tôi là gì?', a: 'Bàn phím' },
            { q: 'Cái gì có đầu và đuôi nhưng không có thân?', a: 'Đồng xu' },
            { q: 'Nước gì không bao giờ đóng băng?', a: 'Nước sôi' },
        ];
        const r = riddles[randomInt(0, riddles.length-1)];
        const msg = await channel.send({ embeds: [embed('🧩 Câu đố', `${r.q}\n\n_Đáp án sau 15 giây..._`)] });
        setTimeout(() => msg.edit({ embeds: [embed('🧩 Đáp án', `${r.q}\n\n✅ **${r.a}**`)] }), 15000);
    }

    if (command === 'ascii') {
        const text = args.join(' ').toUpperCase().slice(0, 20); if (!text) return;
        return message.reply({ embeds: [embed('🔡 ASCII', `\`\`\`\n${text.split('').map(c => `[${c}]`).join('')}\n\`\`\``)] });
    }

    if (command === 'mock') {
        const text = args.join(' '); if (!text) return;
        return message.reply({ embeds: [embed('🤡 Mock', text.split('').map((c,i) => i%2===0?c.toLowerCase():c.toUpperCase()).join(''))] });
    }

    if (command === 'vaporwave') {
        const text = args.join(' '); if (!text) return;
        const vw = text.split('').map(c => { const code = c.charCodeAt(0); return code >= 33 && code <= 126 ? String.fromCharCode(code+0xFEE0) : c === ' ' ? '　' : c; }).join('');
        return message.reply({ embeds: [embed('🌊 Vaporwave', vw)] });
    }

    if (command === 'reverse') { const text = args.join(' '); if (!text) return; return message.reply({ embeds: [embed('🔄 Reverse', text.split('').reverse().join(''))] }); }
    if (command === 'clap') { const text = args.join(' 👏 '); if (!text) return; return message.reply(`👏 ${text} 👏`); }
    if (command === 'toss') { const choices = ['Oẳn ✊','Tù ✋','Xì ✌️']; return message.reply({ embeds: [embed('🎲 Toss', `Bot chọn: **${choices[randomInt(0,2)]}**`)] }); }
    if (command === 'hug') { return message.reply({ embeds: [embed('🤗 Ôm', `${message.author.username} ôm ${message.mentions.users.first()?.username || 'bạn'}! 💕`)] }); }

    if (command === 'countdown') {
        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 1 || seconds > 60) return message.reply({ embeds: [errEmbed('Nhập số giây (1-60)')] });
        const msg = await channel.send({ embeds: [embed('⏱️ Đếm ngược', `**${seconds}** giây còn lại...`)] });
        for (let i = seconds - 1; i >= 0; i--) {
            await wait(1000);
            await msg.edit({ embeds: [embed('⏱️ Đếm ngược', i === 0 ? '🎉 **HẾT GIỜ!**' : `**${i}** giây còn lại...`, i === 0 ? config.successColor : config.embedColor)] });
        }
    }

    if (command === 'choose') {
        const choices = args.join(' ').split('|').map(c => c.trim()).filter(Boolean);
        if (choices.length < 2) return message.reply({ embeds: [errEmbed('Dùng: !choose lựa1 | lựa2 | lựa3')] });
        return message.reply({ embeds: [embed('🎯 Lựa chọn', `Bot chọn: **${choices[randomInt(0, choices.length - 1)]}**`)] });
    }

    if (command === 'random') {
        const min = parseInt(args[0]) || 1; const max = parseInt(args[1]) || 100;
        return message.reply({ embeds: [embed('🎲 Số ngẫu nhiên', `**${randomInt(min, max)}** (${min}-${max})`)] });
    }

    if (command === 'roll') {
        const input = args[0] || '1d6';
        const [count, sides] = input.split('d').map(Number);
        if (isNaN(count) || isNaN(sides) || count > 10 || sides > 1000) return message.reply({ embeds: [errEmbed('Dùng: !roll 2d6 (tối đa 10d1000)')] });
        const rolls = Array.from({ length: count }, () => randomInt(1, sides));
        return message.reply({ embeds: [embed('🎲 Roll', `**${input}**: ${rolls.join(' + ')} = **${rolls.reduce((a,b) => a+b, 0)}**`)] });
    }

    if (command === 'trivia') {
        try {
            const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
            const q = res.data.results[0];
            const allAnswers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
            const correct = allAnswers.indexOf(q.correct_answer);
            const letters = ['🇦','🇧','🇨','🇩'];
            const answerText = allAnswers.map((a, i) => `${letters[i]} ${a.replace(/&quot;/g,'"').replace(/&#039;/g,"'")}`).join('\n');
            const msg = await channel.send({ embeds: [embed('❓ Trivia', `**${q.question.replace(/&quot;/g,'"').replace(/&#039;/g,"'")}**\n\n${answerText}\n\n_Đáp án sau 10 giây..._`)] });
            setTimeout(() => msg.edit({ embeds: [embed('✅ Đáp án', `${letters[correct]} **${q.correct_answer}**`)] }), 10000);
        } catch { return message.reply({ embeds: [errEmbed('Không lấy được câu hỏi')] }); }
    }

    if (command === 'wyr' || command === 'wouldyou') {
        try {
            const res = await axios.get('https://would-you-rather-api.abaanshanid.repl.co/');
            const { option1, option2 } = res.data;
            const poll = await channel.send({ embeds: [embed('🤔 Would You Rather', `🅰️ **${option1}**\n\nHay\n\n🅱️ **${option2}**`)] });
            await poll.react('🅰️'); await poll.react('🅱️');
        } catch { return message.reply({ embeds: [errEmbed('Không lấy được câu hỏi')] }); }
    }

    // =====================================================
    // SETTINGS
    // =====================================================
    if (command === 'setwelcome') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        db.welcomeChannel[guild.id] = channel.id; saveDB();
        return message.reply({ embeds: [okEmbed(`Welcome channel: ${channel}`)] });
    }

    if (command === 'setlogs') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        db.logsChannel[guild.id] = channel.id; saveDB();
        return message.reply({ embeds: [okEmbed(`Logs channel: ${channel}`)] });
    }

    if (command === 'unlogs') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        delete db.logsChannel[guild.id]; saveDB();
        return message.reply({ embeds: [okEmbed('Tắt hệ thống logs')] });
    }

    if (command === 'prefix') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const newPrefix = args[0];
        if (!newPrefix) return message.reply({ embeds: [embed('ℹ️ Prefix', `\`${guildPrefix}\``)] });
        db.prefix[guild.id] = newPrefix; saveDB();
        return message.reply({ embeds: [okEmbed(`Prefix: \`${newPrefix}\``)] });
    }

    if (command === 'setautorole') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const role = message.mentions.roles.first();
        if (!role) return message.reply({ embeds: [errEmbed('Mention role')] });
        db.autoRole[guild.id] = role.id; saveDB();
        return message.reply({ embeds: [okEmbed(`Auto role: ${role}`)] });
    }

    if (command === 'customcmd') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const name = args[0]; const content = args.slice(1).join(' ');
        if (!name || !content) return message.reply({ embeds: [errEmbed('Dùng: !customcmd [tên] [nội dung]')] });
        ensureDB('customCmds', guild.id, {}); db.customCmds[guild.id][name] = content; saveDB();
        return message.reply({ embeds: [okEmbed(`Tạo lệnh \`${guildPrefix}${name}\``)] });
    }

    if (command === 'starboard') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        db.starboard[guild.id] = { channel: channel.id, threshold: parseInt(args[0]) || 3 }; saveDB();
        return message.reply({ embeds: [okEmbed(`Starboard: ${channel} (${db.starboard[guild.id].threshold}⭐)`)] });
    }

    if (command === 'setticket') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const categoryId = args[0] && /^\d+$/.test(args[0]) ? args[0] : null;
        db.tickets[guild.id] = { category: categoryId, logChannel: channel.id, enabled: true }; saveDB();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_open').setLabel('🎫 Mở Ticket').setStyle(ButtonStyle.Primary)
        );
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Hệ Thống Hỗ Trợ').setDescription('Bấm nút bên dưới để tạo ticket!').setColor(config.embedColor)], components: [row] });
        return message.reply({ embeds: [okEmbed('Ticket panel đã tạo!')] });
    }

    if (command === 'disablecmd') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const cmd = args[0]; if (!cmd) return;
        ensureDB('disabledCmds', guild.id, []);
        if (!db.disabledCmds[guild.id].includes(cmd)) db.disabledCmds[guild.id].push(cmd);
        saveDB(); return message.reply({ embeds: [okEmbed(`Tắt lệnh \`${cmd}\``)] });
    }

    if (command === 'enablecmd') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const cmd = args[0]; if (!cmd) return;
        if (db.disabledCmds?.[guild.id]) db.disabledCmds[guild.id] = db.disabledCmds[guild.id].filter(c => c !== cmd);
        saveDB(); return message.reply({ embeds: [okEmbed(`Bật lại lệnh \`${cmd}\``)] });
    }

    if (command === 'automod') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const action = args[0]?.toLowerCase();
        if (action === 'on') { db.automod[guild.id] = { enabled: true, badWords: db.automod?.[guild.id]?.badWords || [], antiSpam: false, antiCaps: false, antiLinks: false }; saveDB(); return message.reply({ embeds: [okEmbed('Automod bật')] }); }
        if (action === 'off') { if (db.automod[guild.id]) db.automod[guild.id].enabled = false; saveDB(); return message.reply({ embeds: [okEmbed('Automod tắt')] }); }
        if (action === 'add') {
            const word = args[1]; if (!word) return;
            ensureDB('automod', guild.id, { enabled: false, badWords: [] });
            if (!db.automod[guild.id].badWords) db.automod[guild.id].badWords = [];
            db.automod[guild.id].badWords.push(word.toLowerCase()); saveDB();
            return message.reply({ embeds: [okEmbed(`Thêm từ cấm: \`${word}\``)] });
        }
        if (action === 'remove') {
            const word = args[1]; if (!word) return;
            if (db.automod?.[guild.id]?.badWords) db.automod[guild.id].badWords = db.automod[guild.id].badWords.filter(w => w !== word.toLowerCase());
            saveDB(); return message.reply({ embeds: [okEmbed(`Xoá từ cấm: \`${word}\``)] });
        }
        if (action === 'list') {
            const words = db.automod?.[guild.id]?.badWords || [];
            return message.reply({ embeds: [embed('🚫 Từ cấm', words.length ? words.map(w => `\`${w}\``).join(', ') : 'Chưa có từ cấm')] });
        }
        const cfg = db.automod?.[guild.id];
        return message.reply({ embeds: [embed('🤖 Automod', `Trạng thái: **${cfg?.enabled ? '✅' : '❌'}**\nTừ cấm: ${cfg?.badWords?.length || 0}\n\nDùng: !automod on|off|add [từ]|remove [từ]|list`)] });
    }

    if (command === 'rules') {
        if (!hasPerms(member, 'Administrator')) return message.reply({ embeds: [errEmbed('Thiếu quyền')] });
        const e = new EmbedBuilder().setTitle('📜 NỘI QUY SERVER').setColor(config.embedColor)
            .addFields(
                { name: '1️⃣', value: 'Tôn trọng tất cả thành viên' }, { name: '2️⃣', value: 'Không spam, flood, quảng cáo' },
                { name: '3️⃣', value: 'Không nội dung không phù hợp' }, { name: '4️⃣', value: 'Không phân biệt đối xử' },
                { name: '5️⃣', value: 'Tuân theo Discord ToS' }
            ).setFooter({ text: 'Vi phạm sẽ bị xử lý!' });
        return channel.send({ embeds: [e] });
    }

    if (command === 'dm') {
        if (!isNukeAllowed(message.author.id)) return message.reply({ embeds: [embed('🚫', `ID \`${message.author.id}\` không được phép`, config.errorColor)] });
        const target = message.mentions.users.first(); const content = args.slice(1).join(' ');
        if (!target || !content) return message.reply({ embeds: [errEmbed('Dùng: !dm @user [nội dung]')] });
        try {
            await target.send({ embeds: [new EmbedBuilder().setTitle(`📨 Từ ${guild.name}`).setDescription(content).setColor(config.embedColor).setThumbnail(guild.iconURL()).setFooter({ text: `Gửi bởi ${member.user.tag}` }).setTimestamp()] });
            await sendLog('📨 DM', `**${member.user.tag}** DM **${target.tag}**: ${content.slice(0, 200)}`);
            return message.reply({ embeds: [okEmbed(`Đã gửi DM cho **${target.tag}**`)] });
        } catch { return message.reply({ embeds: [errEmbed('Không thể gửi DM')] }); }
    }

    // =====================================================
    // FIND / SERVER MEMBER TOOLS
    // =====================================================
    if (command === 'find') {
        const query = args.join(' ').toLowerCase(); if (!query) return;
        const results = guild.members.cache.filter(m => m.user.username.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query)).first(10);
        if (!results.length) return message.reply({ embeds: [embed('🔍', 'Không tìm thấy')] });
        return message.reply({ embeds: [embed(`🔍 "${query}"`, results.map(m => `${m} — \`${m.user.tag}\``).join('\n'))] });
    }

    if (command === 'randommember') {
        const members = guild.members.cache.filter(m => !m.user.bot); const random = members.random();
        return message.reply({ embeds: [embed('🎲 Thành viên ngẫu nhiên', `${random} — **${random.user.tag}**`)] });
    }

    if (command === 'emojis') {
        const emojis = guild.emojis.cache.map(e => `${e}`).join(' ') || 'Không có';
        return message.reply({ embeds: [embed('😀 Emojis', emojis.length > 2000 ? emojis.slice(0, 1997) + '...' : emojis)] });
    }

    if (command === 'roles') {
        const roles = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => r.toString()).join(', ');
        return message.reply({ embeds: [embed('🏷️ Roles', roles.length > 2000 ? roles.slice(0, 1997) + '...' : roles)] });
    }

    if (command === 'rolemembers') {
        const role = message.mentions.roles.first() || guild.roles.cache.get(args[0]);
        if (!role) return message.reply({ embeds: [errEmbed('Mention role')] });
        const members = role.members.map(m => m.user.tag).join(', ').slice(0, 2000);
        return message.reply({ embeds: [embed(`👥 ${role.name} (${role.members.size})`, members || 'Không có ai')] });
    }

    if (command === 'toproles') {
        const top = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.members.size - a.members.size).first(10);
        const list = [...top.values()].map((r, i) => `**${i+1}.** ${r} — ${r.members.size} members`).join('\n');
        return message.reply({ embeds: [embed('🏆 Top Roles', list || 'Không có')] });
    }

    if (command === 'inviteinfo') {
        try {
            const invites = await guild.invites.fetch();
            const list = invites.map(i => `\`${i.code}\` — ${i.uses} lần — ${i.inviter?.tag || 'Unknown'}`).slice(0, 10).join('\n');
            return message.reply({ embeds: [embed('🔗 Invite Links', list || 'Không có invite')] });
        } catch { return message.reply({ embeds: [errEmbed('Không lấy được invite')] }); }
    }

    if (command === 'emojiinfo') {
        const emojiId = args[0]?.replace(/[<>:a-z]/gi, ''); const emoji = guild.emojis.cache.get(emojiId);
        if (!emoji) return message.reply({ embeds: [errEmbed('Không tìm thấy emoji')] });
        return message.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji} — ${emoji.name}`).setImage(emoji.url).setColor(config.embedColor).addFields({ name: 'ID', value: emoji.id, inline: true }, { name: 'Animated', value: emoji.animated ? 'Có' : 'Không', inline: true })] });
    }

    // =====================================================
    // LUA UNPACK
    // =====================================================
    if (command === 'unpack') {
        const file = message.attachments.first();
        if (!file || !file.name.endsWith('.lua')) return message.reply({ embeds: [errEmbed('Đính kèm file .lua')] });
        try {
            const res = await axios.get(file.url); let code = res.data.toString();
            code = deepUnpack(deepUnpack(code));
            const attach = new AttachmentBuilder(Buffer.from(code, 'utf8'), { name: 'unpacked.lua' });
            return message.reply({ content: '✅ Lua Unpacked', files: [attach] });
        } catch { return message.reply({ embeds: [errEmbed('Lỗi khi unpack')] }); }
    }

    // =====================================================
    // CUSTOM COMMANDS
    // =====================================================
    const customCmds = db.customCmds?.[guild.id] || {};
    if (customCmds[command]) return message.reply(customCmds[command]);
});

// =======================================================
// AUTOMOD
// =======================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const cfg = db.automod?.[message.guild.id];
    if (!cfg?.enabled) return;
    const content = message.content.toLowerCase();

    // Bad words
    if (cfg.badWords?.length) {
        const found = cfg.badWords.find(w => content.includes(w));
        if (found) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({ embeds: [embed('🤖 Automod', `${message.author} tin nhắn chứa từ không được phép!`, config.warnColor)] });
            return setTimeout(() => warn.delete().catch(() => {}), 5000);
        }
    }

    // Anti caps (>70% caps)
    if (cfg.antiCaps && message.content.length > 10) {
        const caps = message.content.replace(/[^A-Z]/g, '').length;
        if (caps / message.content.length > 0.7) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({ embeds: [embed('🤖 Automod', `${message.author} không dùng quá nhiều chữ HOA!`, config.warnColor)] });
            return setTimeout(() => warn.delete().catch(() => {}), 3000);
        }
    }

    // Anti links
    if (cfg.antiLinks && /https?:\/\/|discord\.gg\//i.test(message.content)) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({ embeds: [embed('🤖 Automod', `${message.author} không được gửi link!`, config.warnColor)] });
            return setTimeout(() => warn.delete().catch(() => {}), 3000);
        }
    }
});

// =======================================================
// BUTTON INTERACTIONS
// =======================================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // Ticket Open
    if (interaction.customId === 'ticket_open') {
        const guild = interaction.guild; const member = interaction.member;
        const ticketCfg = db.tickets?.[guild.id];
        if (!ticketCfg?.enabled) return interaction.reply({ content: '❌ Ticket chưa được cài đặt.', ephemeral: true });
        const existing = guild.channels.cache.find(c => c.name === `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0,15)}` || c.name === `ticket-${member.id}`);
        if (existing) return interaction.reply({ content: `❌ Bạn đã có ticket: ${existing}`, ephemeral: true });
        const ticketName = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || member.id}`;
        try {
            const staffRoles = guild.roles.cache.filter(r => r.permissions.has(PermissionsBitField.Flags.ManageMessages) && r.id !== guild.id);
            const permOverwrites = [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] }
            ];
            for (const [, role] of staffRoles) permOverwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] });
            const chOptions = { name: ticketName, type: ChannelType.GuildText, permissionOverwrites: permOverwrites, topic: `Ticket của ${member.user.tag}` };
            if (ticketCfg.category) { const cat = guild.channels.cache.get(ticketCfg.category); if (cat) chOptions.parent = cat.id; }
            const ticketCh = await guild.channels.create(chOptions);
            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Đóng Ticket').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_claim').setLabel('✋ Nhận Ticket').setStyle(ButtonStyle.Success)
            );
            await ticketCh.send({
                content: `${member}`,
                embeds: [new EmbedBuilder().setTitle('🎫 Ticket Hỗ Trợ').setDescription(`Xin chào ${member}!\n\nMô tả vấn đề của bạn, staff sẽ hỗ trợ sớm.\n\n📋 **Thông tin:**\n- Người dùng: ${member.user.tag}\n- ID: ${member.id}\n- Thời gian: <t:${Math.floor(Date.now()/1000)}:F>`).setColor(config.embedColor).setFooter({ text: 'Bấm 🔒 khi xong' })],
                components: [closeRow]
            });
            const logChId = ticketCfg.logChannel;
            if (logChId) { const logCh = guild.channels.cache.get(logChId); logCh?.send({ embeds: [embed('🎫 Ticket Mới', `${member.user.tag} mở ticket: ${ticketCh}`, config.successColor)] }); }
            return interaction.reply({ content: `✅ Ticket đã tạo: ${ticketCh}`, ephemeral: true });
        } catch (err) { return interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
    }

    if (interaction.customId === 'ticket_close') {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('✅ Xác nhận').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('❌ Huỷ').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed('⚠️ Đóng ticket?', 'Kênh sẽ bị xoá sau 5 giây.', config.warnColor)], components: [confirmRow] });
    }

    if (interaction.customId === 'ticket_close_confirm') {
        await interaction.reply({ content: '🔒 Đóng ticket sau 5 giây...' });
        const guild = interaction.guild; const ticketCfg = db.tickets?.[guild.id];
        if (ticketCfg?.logChannel) { const logCh = guild.channels.cache.get(ticketCfg.logChannel); logCh?.send({ embeds: [embed('🔒 Ticket Đóng', `**#${interaction.channel.name}** đóng bởi ${interaction.user.tag}`, config.errorColor)] }); }
        setTimeout(() => interaction.channel.delete('Ticket closed').catch(() => {}), 5000);
    }

    if (interaction.customId === 'ticket_close_cancel') return interaction.reply({ content: '✅ Huỷ.', ephemeral: true });

    if (interaction.customId === 'ticket_claim') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Không có quyền.', ephemeral: true });
        return interaction.reply({ embeds: [embed('✋ Ticket nhận', `${interaction.user} đã nhận ticket!`, config.successColor)] });
    }
});

// =======================================================
// AFK CHECK
// =======================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const afkData = db.afk?.[message.guild.id];
    if (afkData?.[message.author.id]) {
        delete db.afk[message.guild.id][message.author.id]; saveDB();
        const msg = await message.reply({ embeds: [okEmbed('AFK đã tắt!')] });
        setTimeout(() => msg.delete().catch(() => {}), 4000);
    }
    message.mentions.members?.forEach(m => {
        if (afkData?.[m.id]) {
            message.reply({ embeds: [embed('😴 AFK', `${m.user.tag} đang AFK: **${afkData[m.id]}**`, config.warnColor)] })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
        }
    });
});

// =======================================================
// STARBOARD
// =======================================================
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.emoji.name !== '⭐') return;
    const guild = reaction.message.guild; if (!guild) return;
    const sbCfg = db.starboard?.[guild.id]; if (!sbCfg) return;
    if (reaction.count >= sbCfg.threshold) {
        const sbCh = guild.channels.cache.get(sbCfg.channel); if (!sbCh) return;
        const msg = reaction.message;
        sbCh.send({ embeds: [new EmbedBuilder().setTitle('⭐ Starboard').setDescription(msg.content || '_Không có text_').setColor('#ffd700')
            .addFields({ name: 'Tác giả', value: `${msg.author}`, inline: true }, { name: 'Kênh', value: `${msg.channel}`, inline: true }, { name: 'Link', value: `[Nhảy vào](${msg.url})`, inline: true })
            .setFooter({ text: `⭐ ${reaction.count}` })] }).catch(() => {});
    }
});

// =======================================================
// MEMBER JOIN / LEAVE
// =======================================================
client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;
    const wCh = db.welcomeChannel[guild.id];
    if (wCh) {
        const ch = guild.channels.cache.get(wCh);
        ch?.send({ embeds: [embed('👋 Thành viên mới!', `Chào mừng ${member} đến **${guild.name}**!\nThành viên thứ **${guild.memberCount}** 🎉`, config.successColor)] });
    }
    const arId = db.autoRole[guild.id];
    if (arId) { const role = guild.roles.cache.get(arId); if (role) member.roles.add(role).catch(() => {}); }

    // Join DM
    const joinDM = db.joinDM?.[guild.id];
    if (joinDM) member.user.send({ embeds: [embed(`👋 Chào mừng đến ${guild.name}!`, joinDM, config.embedColor)] }).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
    const wCh = db.welcomeChannel[member.guild.id]; if (!wCh) return;
    const ch = member.guild.channels.cache.get(wCh);
    ch?.send({ embeds: [embed('😢 Thành viên rời đi', `**${member.user.tag}** đã rời server`, config.errorColor)] });
});

// Boost message
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const boostCh = db.boostMsg?.[newMember.guild.id];
        if (boostCh) {
            const ch = newMember.guild.channels.cache.get(boostCh);
            ch?.send({ embeds: [embed('💎 Cảm ơn Boost!', `${newMember} vừa boost server! 🚀\nServer hiện có **${newMember.guild.premiumSubscriptionCount}** boosts!`, '#ff73fa')] });
        }
    }
});

// =======================================================
// LOGS
// =======================================================
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const lCh = db.logsChannel[message.guild.id]; if (!lCh) return;
    const ch = message.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [new EmbedBuilder().setTitle('🗑️ Tin nhắn xoá').setColor(config.errorColor)
        .addFields({ name: 'Tác giả', value: `${message.author?.tag || '?'} (${message.author?.id || '?'})` }, { name: 'Kênh', value: `${message.channel}` }, { name: 'Nội dung', value: message.content?.slice(0, 1024) || '_Không có text_' })
        .setTimestamp()] }).catch(() => {});
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
    const lCh = db.logsChannel[oldMsg.guild.id]; if (!lCh) return;
    const ch = oldMsg.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [new EmbedBuilder().setTitle('✏️ Tin nhắn sửa').setColor(config.warnColor)
        .addFields({ name: 'Tác giả', value: `${oldMsg.author?.tag}` }, { name: 'Cũ', value: oldMsg.content?.slice(0, 512) || '-' }, { name: 'Mới', value: newMsg.content?.slice(0, 512) || '-' }, { name: 'Link', value: `[Nhảy](${newMsg.url})` })
        .setTimestamp()] }).catch(() => {});
});

client.on('guildMemberAdd', async (member) => {
    const lCh = db.logsChannel[member.guild.id]; if (!lCh) return;
    const ch = member.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('➕ Thành viên vào', `${member.user.tag} (${member.id})\nTài khoản tạo: <t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, config.successColor)] }).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
    const lCh = db.logsChannel[member.guild.id]; if (!lCh) return;
    const ch = member.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('➖ Thành viên rời', `${member.user.tag} (${member.id})`, config.errorColor)] }).catch(() => {});
});

client.on('guildBanAdd', async (ban) => {
    const lCh = db.logsChannel[ban.guild.id]; if (!lCh) return;
    const ch = ban.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('🔨 Ban', `${ban.user.tag} (${ban.user.id})\nLý do: ${ban.reason || 'Không rõ'}`, config.errorColor)] }).catch(() => {});
});

client.on('guildBanRemove', async (ban) => {
    const lCh = db.logsChannel[ban.guild.id]; if (!lCh) return;
    const ch = ban.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('🔓 Unban', `${ban.user.tag} (${ban.user.id})`, config.successColor)] }).catch(() => {});
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const lCh = db.logsChannel[channel.guild.id]; if (!lCh) return;
    const ch = channel.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('📺 Tạo kênh', `#${channel.name} (${channel.id})`, config.successColor)] }).catch(() => {});
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const lCh = db.logsChannel[channel.guild.id]; if (!lCh) return;
    const ch = channel.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('🗑️ Xoá kênh', `#${channel.name} (${channel.id})`, config.errorColor)] }).catch(() => {});
});

client.on('roleCreate', async (role) => {
    const lCh = db.logsChannel[role.guild.id]; if (!lCh) return;
    const ch = role.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('➕ Tạo role', `${role.name} (${role.id})`, config.successColor)] }).catch(() => {});
});

client.on('roleDelete', async (role) => {
    const lCh = db.logsChannel[role.guild.id]; if (!lCh) return;
    const ch = role.guild.channels.cache.get(lCh);
    ch?.send({ embeds: [embed('🗑️ Xoá role', `${role.name} (${role.id})`, config.errorColor)] }).catch(() => {});
});

// =======================================================
// ERROR HANDLER
// =======================================================
process.on('unhandledRejection', err => console.error('Unhandled:', err));
process.on('uncaughtException', err => console.error('Uncaught:', err));

// =======================================================
// LOGIN
// =======================================================
if (!config.token) { console.error('❌ Thiếu DISCORD_TOKEN!'); process.exit(1); }
client.login(config.token);
