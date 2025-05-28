import {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("eventping")
    .setDescription(
      "Notify members about an event, create a temporary voice channel, and customize roles and time."
    )
    .addStringOption((option) =>
      option
        .setName("departure_time")
        .setDescription(
          "The departure time for the event in UTC (e.g., 15:00)."
        )
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      const requiredRoles = {
        King: true,
        "Lord of the House": true,
      }; // Object lookup for faster checks

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

      const guild = interaction.guild;

      // Get the departure time from the command options
      const departureTime = interaction.options.getString("departure_time");

      // Create a temporary voice channel in the "War Room" category
      let tempVoiceChannel;
      try {
        const warRoomCategory = guild.channels.cache.find(
          (channel) =>
            channel.type === ChannelType.GuildCategory &&
            channel.name.toUpperCase() === "WAR ROOM"
        );

        if (!warRoomCategory) {
          await interaction.reply({
            content:
              "The 'War Room' category does not exist. Please create it first.",
            ephemeral: true,
          });
          return;
        }

        tempVoiceChannel = await guild.channels.create({
          name: `Event Room - ${interaction.user.username}`,
          type: ChannelType.GuildVoice,
          parent: warRoomCategory.id,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
              ],
            },
          ],
        });
      } catch (error) {
        console.error("Failed to create voice channel:", error);
        await interaction.reply({
          content:
            "Failed to create a temporary voice channel. Please check my permissions.",
          ephemeral: true,
        });
        return;
      }

      // Change the event leader's nickname
      const originalNickname =
        interaction.member.nickname || interaction.user.username;
      try {
        await interaction.member.setNickname(
          `[Event Leader] ${interaction.user.username}`
        );
      } catch (error) {
        console.error("Failed to change nickname:", error);
        // await interaction.reply({
        //   content:
        //     "I couldn't change your nickname. Please check my permissions.",
        //   ephemeral: true,
        // });
      }

      // Fetch all online/DND members
      let targetMembers;
      try {
        const members = await guild.members.fetch();
        targetMembers = members.filter(
          (member) =>
            member.presence &&
            (member.presence.status === "online" ||
              member.presence.status === "dnd") &&
            !member.user.bot
        );
      } catch (error) {
        console.error("Failed to fetch members:", error);
        await interaction.reply({
          content:
            "Failed to fetch online members. Please check my permissions.",
          ephemeral: true,
        });
        return;
      }

      // Map to customize roles for members
      const roleMap = new Map([
        ["Healer", []],
        ["DPS", []],
        ["Tank", []],
        ["Default", []],
      ]);

      // Ask the event leader to assign roles (e.g., via console or UI)
      const assignRoles = async () => {
        for (const [id, member] of targetMembers) {
          // For simplicity, default role assignment is used here
          const role = roleMap.has("Default")
            ? "Default"
            : "Please arrive promptly.";
          roleMap.get(role).push(member.displayName);
        }
      };

      await assignRoles();

      // Helper function to format the message
      const formatMessage = (
        eventLeader,
        role,
        departureTime,
        voiceChannelUrl
      ) => {
        const now = new Date();
        const formattedDate = now.toLocaleDateString("en-US", {
          timeZone: "UTC",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        const formattedTime = now.toLocaleTimeString("en-US", {
          timeZone: "UTC",
          hour12: false,
        });

        const departureInfo =
          departureTime && departureTime !== "null"
            ? `We depart at **${departureTime} UTC**.`
            : `Please, arrive as soon as possible. Departure time not specified.`;

        const linkInfo =
          voiceChannelUrl && voiceChannelUrl !== "unknown"
            ? `Join the event here:\n${voiceChannelUrl}`
            : `Join the event via the server's War Room category.`;

        return (
          `${formattedDate}\n` +
          `${formattedTime} UTC\n\n` +
          `Hello Fellow Valerian,\n\n` +
          `You have been called to arms by **${eventLeader}**.\n\n` +
          `Please join as a **${role}**.\n` +
          `${departureInfo}\n\n` +
          `${linkInfo}`
        );
      };

      // Send DMs with customized messages
      const promises = targetMembers.map(async (member) => {
        const messageContent = formatMessage(
          interaction.member.displayName,
          "Default",
          departureTime,
          tempVoiceChannel?.url || "unknown"
        );

        try {
          await member.send(messageContent);
        } catch (error) {
          console.error(
            `Could not send DM to ${member.displayName}:`,
            error.message
          );
        }
      });

      await Promise.all(promises);

      // Confirm the event creation to the user
      await interaction.reply({
        content: `Event created! Invitations sent to ${targetMembers.size} members. Departure time: ${departureTime} UTC. Join the event here: ${tempVoiceChannel.url}`,
        ephemeral: true,
      });

      // Monitor the voice channel
      const interval = setInterval(async () => {
        try {
          // Fetch the channel again to ensure it exists and is up to date
          const channel = guild.channels.cache.get(tempVoiceChannel.id);

          console.log("channel information", channel);
          console.log("channel members", channel.members);
          if (!channel) {
            // If the channel no longer exists, clear the interval
            clearInterval(interval);
            return;
          }

          // Check if the channel is empty
          if (channel.members.size === 0) {
            clearInterval(interval); // Stop checking if the channel is empty

            // Try to delete the channel
            try {
              await channel.delete();
              console.log(`Deleted the voice channel: ${channel.name}`);
            } catch (deleteError) {
              console.error("Failed to delete the voice channel:", deleteError);
            }

            // Restore the event leader's nickname
            try {
              await interaction.member.setNickname(originalNickname);
              console.log(
                "Restored the original nickname of the event leader."
              );
            } catch (nicknameError) {
              console.error("Failed to restore nickname:", nicknameError);
            }

            // Notify the event creator
            try {
              await interaction.user.send(
                "The event has ended, and the voice channel has been deleted."
              );
            } catch (dmError) {
              console.error("Failed to send DM to the event leader:", dmError);
            }
          }
        } catch (error) {
          console.error("Error monitoring the voice channel:", error);
          clearInterval(interval); // Stop checking if an unexpected error occurs
        }
      }, 5000); // Check every 5 seconds
    } catch (error) {
      console.error("Failed to handle event command:", error);
      await interaction.reply({
        content: "There was an error creating the event.",
        ephemeral: true,
      });
    }
  },
};
