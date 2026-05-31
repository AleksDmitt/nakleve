namespace FishingApp.Api.DTOs.Friends;

public class FriendRequestResponse
{
    public Guid FriendshipId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? Region { get; set; }
    public DateTime CreatedAt { get; set; }
}
