using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FishingApp.Migrations
{
    /// <inheritdoc />
    public partial class AddLegalConsentTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PersonalDataDistributionConsentAccepted",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PersonalDataDistributionConsentAcceptedAtUtc",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalDataDistributionConsentIp",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalDataDistributionConsentUserAgent",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonalDataDistributionConsentVersion",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UserAgreementAccepted",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "UserAgreementAcceptedAtUtc",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserAgreementIp",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserAgreementUserAgent",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserAgreementVersion",
                table: "Users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PersonalDataDistributionConsentAccepted",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataDistributionConsentAcceptedAtUtc",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataDistributionConsentIp",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataDistributionConsentUserAgent",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PersonalDataDistributionConsentVersion",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UserAgreementAccepted",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UserAgreementAcceptedAtUtc",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UserAgreementIp",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UserAgreementUserAgent",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UserAgreementVersion",
                table: "Users");
        }
    }
}
