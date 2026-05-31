namespace FishingApp.Domain.Enums;

public enum VerificationCodePurpose
{
    EmailConfirmation = 1,
    PasswordReset = 2,
    PhoneConfirmation = 3,
    ChangeEmail = 4,
    SensitiveAction = 5,
    PasswordChange = 6
}