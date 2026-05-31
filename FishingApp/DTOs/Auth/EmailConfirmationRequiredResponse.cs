namespace FishingApp.Api.DTOs.Auth;

public class EmailConfirmationRequiredResponse
{
    public bool RequiresEmailConfirmation { get; set; } = true;
    public string Email { get; set; } = null!;
    public string Message { get; set; } = null!;
}