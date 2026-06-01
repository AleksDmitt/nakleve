using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Migrations
{
    /// <inheritdoc />
    public partial class AddVoiceMessageListenStates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VoiceMessageListenStates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChatMessageAttachmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ListenedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VoiceMessageListenStates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VoiceMessageListenStates_ChatMessageAttachments_ChatMessage~",
                        column: x => x.ChatMessageAttachmentId,
                        principalTable: "ChatMessageAttachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_VoiceMessageListenStates_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VoiceMessageListenStates_ChatMessageAttachmentId_UserId",
                table: "VoiceMessageListenStates",
                columns: new[] { "ChatMessageAttachmentId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_VoiceMessageListenStates_UserId",
                table: "VoiceMessageListenStates",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VoiceMessageListenStates");
        }
    }
}
