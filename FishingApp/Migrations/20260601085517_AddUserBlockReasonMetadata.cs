using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBlockReasonMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BlockReasonCode",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BlockReasonText",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BlockedAtUtc",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BlockedByUserId",
                table: "Users",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BlockReasonCode",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "BlockReasonText",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "BlockedAtUtc",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "BlockedByUserId",
                table: "Users");
        }
    }
}
