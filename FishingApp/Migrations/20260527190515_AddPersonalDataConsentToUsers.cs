using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonalDataConsentToUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PersonalDataConsentAccepted",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PersonalDataConsentAcceptedAtUtc",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalDataConsentIp",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalDataConsentUserAgent",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalDataConsentVersion",
                table: "Users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PersonalDataConsentAccepted",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataConsentAcceptedAtUtc",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataConsentIp",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataConsentUserAgent",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataConsentVersion",
                table: "Users");
        }
    }
}
