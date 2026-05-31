using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFishingEntryTimeRange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FishingEntries_UserId",
                table: "FishingEntries");

            migrationBuilder.AddColumn<DateTime>(
                name: "FishingEndedAt",
                table: "FishingEntries",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FishingStartedAt",
                table: "FishingEntries",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntries_UserId_FishingStartedAt",
                table: "FishingEntries",
                columns: new[] { "UserId", "FishingStartedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FishingEntries_UserId_FishingStartedAt",
                table: "FishingEntries");

            migrationBuilder.DropColumn(
                name: "FishingEndedAt",
                table: "FishingEntries");

            migrationBuilder.DropColumn(
                name: "FishingStartedAt",
                table: "FishingEntries");

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntries_UserId",
                table: "FishingEntries",
                column: "UserId");
        }
    }
}
