using UnityEngine;

public class NewGame : MonoBehaviour
{
    public GameObject red;
    public GameObject blue;
    public GameObject spawner;
    public GameObject self;

    // Start is called before the first frame update
    private void Start()
    {
    }

    // Update is called once per frame
    private void FixedUpdate()
    {
        if (red == null && blue == null)
        {
            FindObjectOfType<Scoreboard>().ResetScore();
            FindObjectOfType<Scoreboard>().StartGame();
            Destroy(self);
        }
    }
}
