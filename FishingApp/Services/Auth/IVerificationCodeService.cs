using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;

namespace FishingApp.Api.Services.Auth;

public interface IVerificationCodeService
{
    Task<string> CreateCodeAsync(
        AppUser user,
        VerificationCodePurpose purpose,
        string sentTo,
        string? ipAddress);

    Task<bool> VerifyCodeAsync(
        AppUser user,
        VerificationCodePurpose purpose,
        string code);
}