using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanionSearchLogic : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CompanionResponses_RequestId",
                table: "CompanionResponses");

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "CompanionResponses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SeatsCount",
                table: "CompanionRequests",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_CompanionResponses_RequestId_UserId",
                table: "CompanionResponses",
                columns: new[] { "RequestId", "UserId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CompanionResponses_RequestId_UserId",
                table: "CompanionResponses");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "CompanionResponses");

            migrationBuilder.DropColumn(
                name: "SeatsCount",
                table: "CompanionRequests");

            migrationBuilder.CreateIndex(
                name: "IX_CompanionResponses_RequestId",
                table: "CompanionResponses",
                column: "RequestId");
        }
    }
}
