namespace FishingApp.Api.DTOs.Auth;

public class AuthResponse
{
    public string Token { get; set; } = null!;
    public string UserName { get; set; } = null!;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string DisplayName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public bool EmailConfirmed { get; set; }

    public bool UserAgreementAccepted { get; set; }
    public string? UserAgreementVersion { get; set; }
    public bool PersonalDataConsentAccepted { get; set; }
    public string? PersonalDataConsentVersion { get; set; }
    public bool PersonalDataDistributionConsentAccepted { get; set; }
    public string? PersonalDataDistributionConsentVersion { get; set; }
    public bool LegalDocumentsAccepted { get; set; }
    public bool LegalDocumentsRequired { get; set; }
    public bool ChatToastsEnabled { get; set; } = true;
    public bool HideChatMessageTextInNotifications { get; set; } = false;
}
