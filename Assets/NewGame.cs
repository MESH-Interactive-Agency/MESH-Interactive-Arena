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
        //FindObjectOfType<Scoreboard>().SetArena(0);
    }

    // Update is called once per frame
    private void Update()
    {
        if (red == null && blue == null)
        {
            FindObjectOfType<Scoreboard>().ResetScore();
            FindObjectOfType<Scoreboard>().StartGame();
            Destroy(self);
        }
    }
}
