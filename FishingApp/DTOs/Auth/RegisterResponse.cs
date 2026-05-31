namespace FishingApp.Api.DTOs.Auth;

public class RegisterResponse
{
    public bool RequiresEmailConfirmation { get; set; }
    public string Email { get; set; } = null!;
    public string Message { get; set; } = null!;
}