namespace FishingApp.Api.Settings;

public class EmailSettings
{
    public string FromName { get; set; } = "НаКлёве";
    public string FromEmail { get; set; } = null!;
    public string SmtpHost { get; set; } = null!;
    public int SmtpPort { get; set; }
    public bool UseSsl { get; set; }
    public string UserName { get; set; } = null!;
    public string Password { get; set; } = null!;
}