using FishingApp.Api.Services.Auth;
using FishingApp.Api.Settings;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace FishingApp.Services.Auth;

public class YandexSmtpEmailSender : IAppEmailSender
{
    private readonly EmailSettings _settings;
    private readonly ILogger<YandexSmtpEmailSender> _logger;

    public YandexSmtpEmailSender(
        IOptions<EmailSettings> options,
        ILogger<YandexSmtpEmailSender> logger)
    {
        _settings = options.Value;
        _logger = logger;
    }

    public async Task SendEmailConfirmationCodeAsync(string email, string code)
    {
        var message = new MimeMessage();

        message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromEmail));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Код подтверждения НаКлёве";

        message.Body = new TextPart("html")
        {
            Text = $"""
            <div style="font-family: Arial, sans-serif; max-width: 520px;">
                <h2>Подтверждение email</h2>
                <p>Ваш код подтверждения для регистрации в приложении НаКлёве:</p>
                <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">
                    {code}
                </div>
                <p>Код действует 10 минут.</p>
                <p>Если вы не регистрируетесь в НаКлёве, просто проигнорируйте это письмо.</p>
            </div>
            """
        };

        using var client = new SmtpClient();

        try
        {
            var socketOptions = _settings.UseSsl
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTls;

            await client.ConnectAsync(_settings.SmtpHost, _settings.SmtpPort, socketOptions);
            await client.AuthenticateAsync(_settings.UserName, _settings.Password);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Email confirmation code sent to {Email}", email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email confirmation code to {Email}", email);
            throw new InvalidOperationException("Не удалось отправить письмо с кодом подтверждения.");
        }
    }
    public async Task SendPasswordResetCodeAsync(string email, string code)
    {
        var message = new MimeMessage();

        message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromEmail));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Код восстановления пароля НаКлёве";

        message.Body = new TextPart("html")
        {
            Text = $"""
        <div style="font-family: Arial, sans-serif; max-width: 520px;">
            <h2>Восстановление пароля</h2>
            <p>Вы запросили восстановление доступа к аккаунту НаКлёве.</p>
            <p>Ваш код подтверждения:</p>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">
                {code}
            </div>
            <p>Код действует 10 минут.</p>
            <p>Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.</p>
        </div>
        """
        };

        using var client = new SmtpClient();

        try
        {
            var socketOptions = _settings.UseSsl
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTls;

            await client.ConnectAsync(_settings.SmtpHost, _settings.SmtpPort, socketOptions);
            await client.AuthenticateAsync(_settings.UserName, _settings.Password);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Password reset code sent to {Email}", email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send password reset code to {Email}", email);

            throw new InvalidOperationException("Не удалось отправить письмо с кодом восстановления пароля.");
        }
    }
    public async Task SendPasswordChangeCodeAsync(string email, string code)
    {
        var message = new MimeMessage();

        message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromEmail));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Код смены пароля НаКлёве";

        message.Body = new TextPart("html")
        {
            Text = $"""
        <div style="font-family: Arial, sans-serif; max-width: 520px;">
            <h2>Смена пароля</h2>
            <p>Вы запросили смену пароля в аккаунте НаКлёве.</p>
            <p>Ваш код подтверждения:</p>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">
                {code}
            </div>
            <p>Код действует 10 минут.</p>
            <p>Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.</p>
        </div>
        """
        };

        using var client = new SmtpClient();

        try
        {
            var socketOptions = _settings.UseSsl
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTls;

            await client.ConnectAsync(_settings.SmtpHost, _settings.SmtpPort, socketOptions);
            await client.AuthenticateAsync(_settings.UserName, _settings.Password);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Password change code sent to {Email}", email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send password change code to {Email}", email);

            throw new InvalidOperationException("Не удалось отправить письмо с кодом смены пароля.");
        }
    }

}