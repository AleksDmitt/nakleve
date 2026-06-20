using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Migrations
{
    /// <inheritdoc />
    public partial class AddChatMessageForwardMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ForwardedFromUserId",
                table: "ChatMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ForwardedFromUserName",
                table: "ChatMessages",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsForwarded",
                table: "ChatMessages",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ForwardedFromUserId",
                table: "ChatMessages");

            migrationBuilder.DropColumn(
                name: "ForwardedFromUserName",
                table: "ChatMessages");

            migrationBuilder.DropColumn(
                name: "IsForwarded",
                table: "ChatMessages");
        }
    }
}
