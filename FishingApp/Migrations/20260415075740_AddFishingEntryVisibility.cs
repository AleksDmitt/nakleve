using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFishingEntryVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPublishedToFeed",
                table: "FishingEntries",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "FishingEntries",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPublishedToFeed",
                table: "FishingEntries");

            migrationBuilder.DropColumn(
                name: "Visibility",
                table: "FishingEntries");
        }
    }
}
