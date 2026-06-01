using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicMapPointsAndAdminRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "PointsOfInterest",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_PointsOfInterest_IsPublic",
                table: "PointsOfInterest",
                column: "IsPublic");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PointsOfInterest_IsPublic",
                table: "PointsOfInterest");

            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "PointsOfInterest");
        }
    }
}
