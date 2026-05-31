using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFishingEntrySocialActions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FishingEntryComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FishingEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FishingEntryComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FishingEntryComments_FishingEntries_FishingEntryId",
                        column: x => x.FishingEntryId,
                        principalTable: "FishingEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FishingEntryComments_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FishingEntryLikes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FishingEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FishingEntryLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FishingEntryLikes_FishingEntries_FishingEntryId",
                        column: x => x.FishingEntryId,
                        principalTable: "FishingEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FishingEntryLikes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FishingEntryShares",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FishingEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FishingEntryShares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FishingEntryShares_FishingEntries_FishingEntryId",
                        column: x => x.FishingEntryId,
                        principalTable: "FishingEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FishingEntryShares_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryComments_FishingEntryId",
                table: "FishingEntryComments",
                column: "FishingEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryComments_UserId",
                table: "FishingEntryComments",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryLikes_FishingEntryId_UserId",
                table: "FishingEntryLikes",
                columns: new[] { "FishingEntryId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryLikes_UserId",
                table: "FishingEntryLikes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryShares_FishingEntryId",
                table: "FishingEntryShares",
                column: "FishingEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryShares_UserId",
                table: "FishingEntryShares",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FishingEntryComments");

            migrationBuilder.DropTable(
                name: "FishingEntryLikes");

            migrationBuilder.DropTable(
                name: "FishingEntryShares");
        }
    }
}
