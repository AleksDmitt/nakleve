using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFeedCommentRepliesAndChatShares : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FishingEntryComments_FishingEntryId",
                table: "FishingEntryComments");

            migrationBuilder.AddColumn<Guid>(
                name: "ParentCommentId",
                table: "FishingEntryComments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SharedFishingEntryId",
                table: "ChatMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryComments_FishingEntryId_ParentCommentId_Created~",
                table: "FishingEntryComments",
                columns: new[] { "FishingEntryId", "ParentCommentId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryComments_ParentCommentId",
                table: "FishingEntryComments",
                column: "ParentCommentId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_SharedFishingEntryId",
                table: "ChatMessages",
                column: "SharedFishingEntryId");

            migrationBuilder.AddForeignKey(
                name: "FK_ChatMessages_FishingEntries_SharedFishingEntryId",
                table: "ChatMessages",
                column: "SharedFishingEntryId",
                principalTable: "FishingEntries",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_FishingEntryComments_FishingEntryComments_ParentCommentId",
                table: "FishingEntryComments",
                column: "ParentCommentId",
                principalTable: "FishingEntryComments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ChatMessages_FishingEntries_SharedFishingEntryId",
                table: "ChatMessages");

            migrationBuilder.DropForeignKey(
                name: "FK_FishingEntryComments_FishingEntryComments_ParentCommentId",
                table: "FishingEntryComments");

            migrationBuilder.DropIndex(
                name: "IX_FishingEntryComments_FishingEntryId_ParentCommentId_Created~",
                table: "FishingEntryComments");

            migrationBuilder.DropIndex(
                name: "IX_FishingEntryComments_ParentCommentId",
                table: "FishingEntryComments");

            migrationBuilder.DropIndex(
                name: "IX_ChatMessages_SharedFishingEntryId",
                table: "ChatMessages");

            migrationBuilder.DropColumn(
                name: "ParentCommentId",
                table: "FishingEntryComments");

            migrationBuilder.DropColumn(
                name: "SharedFishingEntryId",
                table: "ChatMessages");

            migrationBuilder.CreateIndex(
                name: "IX_FishingEntryComments_FishingEntryId",
                table: "FishingEntryComments",
                column: "FishingEntryId");
        }
    }
}
