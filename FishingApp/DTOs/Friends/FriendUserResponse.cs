namespace FishingApp.Api.DTOs.Friends;

public class FriendUserResponse
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? Region { get; set; }

    public string FriendStatus { get; set; } = "Friends";
    public Guid? FriendshipId { get; set; }
}
