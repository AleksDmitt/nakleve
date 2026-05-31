namespace FishingApp.Api.Services.Auth;

public interface IAppEmailSender
{
    Task SendEmailConfirmationCodeAsync(string email, string code);

    Task SendPasswordResetCodeAsync(string email, string code);

    Task SendPasswordChangeCodeAsync(string email, string code);
}