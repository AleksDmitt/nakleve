namespace FishingApp.Api.DTOs.Chat;

public class ForwardChatMessageRequest
{
    public List<Guid> TargetChatIds { get; set; } = new();
    public List<Guid> MessageIds { get; set; } = new();
}
