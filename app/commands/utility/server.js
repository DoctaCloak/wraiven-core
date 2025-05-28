import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription(
      "Provides information about the server and lists online members."
    ),
  async execute(interaction) {
    try {
      // Fetch all members in the guild
      const members = await interaction.guild.members.fetch();

      // Filter members who are online
      const onlineMembers = members.filter(
        (member) => member.presence && member.presence.status === "online"
      );

      console.log("members", members);

      // Extract usernames or nicknames of online members
      const onlineMemberNames = onlineMembers.map(
        (member) => `- ${member.displayName}`
      );

      const onlineList =
        onlineMemberNames.join("\n") || "No members are currently online.";

      // Reply with server info and formatted online members list
      await interaction.reply(
        `**Server Information:**\n` +
          `Server Name: **${interaction.guild.name}**\n` +
          `Total Members: **${interaction.guild.memberCount}**\n\n` +
          `**Online Members:**\n${onlineList}`
      );
    } catch (error) {
      console.error("Failed to fetch online members:", error);
      await interaction.reply({
        content: "There was an error fetching the online members.",
        ephemeral: true,
      });
    }
  },
};
