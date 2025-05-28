import {
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
} from "discord.js";
import { MongoClient, ServerApiVersion } from "mongodb";
import { config } from "dotenv";

// Load environment variables
config();

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const username = encodeURIComponent("doctacloak");
const password = encodeURIComponent("lY6vNE59x0irLdFH");

const uri = `mongodb+srv://${username}:${password}@housevalier.hrmke.mongodb.net/?retryWrites=true&w=majority&appName=HouseValier`;

const MONGO_CLIENT = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let database;

/**
 * Initialize MongoDB connection
 */
async function run() {
  try {
    await MONGO_CLIENT.connect();
    const databaseName = "HouseValier";
    database = MONGO_CLIENT.db(databaseName);

    // Test connection
    await MONGO_CLIENT.db("admin").command({ ping: 1 });
    console.log("Pinged MongoDB deployment successfully!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server.")
    .addUserOption((option) =>
      option.setName("target").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the kick")
        .setRequired(false)
    ),

  async execute(interaction) {
    // Roles that can use this command
    const requiredRoles = {
      King: true,
      "Lord of the House": true,
    };

    // Check if member has one of the required roles
    const hasRole = interaction.member.roles.cache.some(
      (role) => requiredRoles[role.name]
    );

    if (!hasRole) {
      await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    // Check for Kick Members permission
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)
    ) {
      await interaction.reply({
        content: "You don't have permission to kick members.",
        ephemeral: true,
      });
      return;
    }

    // 1) Get the user object from the slash command
    const targetUser = interaction.options.getUser("target");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    // 2) Fetch the member from the current guild
    let targetMember;
    try {
      targetMember = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      targetMember = null;
    }

    // Check if the user is actually in the guild
    if (!targetMember) {
      await interaction.reply({
        content: `User **${targetUser.tag}** is not in this server or couldn't be fetched.`,
        ephemeral: true,
      });
      return;
    }

    // Prevent self-kick
    if (targetMember.id === interaction.member.id) {
      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription("⛔ You can't kick yourself.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Prevent kicking an administrator (optional logic)
    if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription("⛔ You can't kick an administrator.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Check reason length
    if (reason.length > 512) {
      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription("⛔ The reason cannot exceed 512 characters.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Attempt to kick
    try {
      await targetMember.kick(reason);
      console.log(`User ${targetUser.tag} was kicked for: ${reason}`);

      // Update the database
      const recruitmentCollection = database.collection("recruitment");
      await recruitmentCollection.updateOne(
        { userId: targetMember.id },
        {
          $set: {
            applicationStatus: "DENIED",
            kickedBy: interaction.user.tag,
            kickReason: reason,
          },
        },
        { upsert: true }
      );

      await interaction.reply({
        content: `✅ User ${targetUser.tag} was kicked. Reason: ${reason}`,
      });
    } catch (error) {
      console.error(`Error kicking user ${targetUser.tag}:`, error);
      await interaction.reply({
        content: `❌ Failed to kick ${targetUser.tag}.`,
        ephemeral: true,
      });
    }
  },
};
