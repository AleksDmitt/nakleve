namespace FishingApp.Api.DTOs.Chat;

public class AddChatParticipantsRequest
{
    public List<Guid> UserIds { get; set; } = new();
}