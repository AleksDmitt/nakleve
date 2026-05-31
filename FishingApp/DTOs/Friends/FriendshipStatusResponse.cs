namespace FishingApp.Api.DTOs.Friends;

public class FriendshipStatusResponse
{
    public bool IsFriend { get; set; }
    public bool IsIncomingRequest { get; set; }
    public bool IsOutgoingRequest { get; set; }
    public Guid? FriendshipId { get; set; }
}