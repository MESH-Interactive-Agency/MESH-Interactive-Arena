
using UnityEngine;

public class Scoreboard : MonoBehaviour
{
    public TextMesh scoreBoard;
    public int hits;
    public int misses;

    void Start()
    {
        hits = 0;
        misses = 0;
        updateText();
    }

    public void IncreaseHits()
    {
        hits++;
        updateText();

    }

    public void IncreaseMisses()
    {
        misses++;
        updateText();
    }

    void updateText()
    {
        scoreBoard.text =  "Hits: " + hits; //" + " | " + "Misses: " + misses;
    }
    // Update is called once per frame
    void Update()
    {
        
    }
}
