using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Migrations
{
    /// <inheritdoc />
    public partial class AddVoiceMessageAttachmentMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsVoiceMessage",
                table: "ChatMessageAttachments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "VoiceDurationMs",
                table: "ChatMessageAttachments",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VoiceWaveform",
                table: "ChatMessageAttachments",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsVoiceMessage",
                table: "ChatMessageAttachments");

            migrationBuilder.DropColumn(
                name: "VoiceDurationMs",
                table: "ChatMessageAttachments");

            migrationBuilder.DropColumn(
                name: "VoiceWaveform",
                table: "ChatMessageAttachments");
        }
    }
}
