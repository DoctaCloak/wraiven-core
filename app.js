import fs from "fs";
import path from "path";

import "dotenv/config";
import express from "express";

import { config } from "dotenv";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";

// Load environment variables
config();

const ROOT_DIR = process.cwd();

// Validate environment variables
const { DISCORD_TOKEN, PUBLIC_KEY } = process.env;

if (!DISCORD_TOKEN || !PUBLIC_KEY) {
  console.error("DISCORD_TOKEN and PUBLIC_KEY are required");
  process.exit(1);
}

// Load functions dynamically
// const FUNCTION_FOLDERS = fs.readdirSync(
//   path.resolve(ROOT_DIR, "app/functions")
// );

// for (const folder of FUNCTION_FOLDERS) {
//   const functionFiles = fs.readdirSync(
//     path.resolve(ROOT_DIR, "app/functions", folder)
//   );

//   for (const file of functionFiles) {
//     try {
//       const module = await import(
//         path.resolve(ROOT_DIR, "app/functions", folder, file)
//       );

//       if (typeof module.default === "function") {
//         module.default(client);
//       }
//     } catch (error) {
//       console.error(`Error loading function file ${file}:`, error);
//     }
//   }
// }

// Create a new client instance
/*
 * he GatewayIntentBits.Guilds intents option is necessary for the discord.js client to work as you expect it to,
 * as it ensures that the caches for guilds, channels, and roles are populated and available for internal use.
 *
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

client.commands = new Collection();

const COMMANDS_FOLDER = path.join(ROOT_DIR, "app/commands");
const commandFolders = fs.readdirSync(COMMANDS_FOLDER);

for (const commandSubfolder of commandFolders) {
  const commandsPath = path.join(COMMANDS_FOLDER, commandSubfolder);

  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const { default: command } = await import(`${filePath}`);

    // Set a new item in the Collection with the key as the command anme and hte value as the exported module
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TS developers
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready!  Logged in as ${readyClient.user.tag}`);
});

// Log in to Discord
client.login(DISCORD_TOKEN);

// Create an Express app
const app = express();

app.use(express.json()); // Middleware for parsing JSON requests

// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
