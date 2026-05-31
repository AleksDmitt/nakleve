using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupChatSoftDeleteAndParticipantStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedByOwnerAt",
                table: "Chats",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByOwnerUserId",
                table: "Chats",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeletedByOwner",
                table: "Chats",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "ChatParticipants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "StatusChangedAt",
                table: "ChatParticipants",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeletedByOwnerAt",
                table: "Chats");

            migrationBuilder.DropColumn(
                name: "DeletedByOwnerUserId",
                table: "Chats");

            migrationBuilder.DropColumn(
                name: "IsDeletedByOwner",
                table: "Chats");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "ChatParticipants");

            migrationBuilder.DropColumn(
                name: "StatusChangedAt",
                table: "ChatParticipants");
        }
    }
}
